var http = require('http');
var events = require('events');
var util = require('util');
var AWS = require('aws-sdk');


var OwnDDNS = function (config) {
  events.EventEmitter.call(this);

  this.config = config;
  this.client53 = new AWS.Route53.Client(config.aws);

  this.zonesDomains = {};
};
util.inherits(OwnDDNS, events.EventEmitter);


/*
 * detect current IP Adress (by making use of DNS-o-matic HTTP API endpoint)
 */
OwnDDNS.prototype.detectIpAddress = function () {
  var that = this;
  http.get({
      hostname: 'myip.dnsomatic.com',
      headers: {
        'Cache-control': 'no-store'
      }
    },
    function (res) {
      res.setEncoding('utf8');
      var data = '';

      res.on('data', function (chunk) {
        data += chunk;
      });

      res.on('end', function () {
        if (/^(\d{1,3}\.){3}\d{1,3}$/.test(data)) {
          if (data !== that.currentIPAddress) {
            that.emit('addressChange', data, that.currentIPAddress);
            that.currentIPAddress = data;
          }
          else {
            that.emit('addressNoChange', data);
          }
        }
        else {
          that.emit('error', data);
        }
      });
    }).on('error', function (err) {
      // TODO: real error handling, e. g. reschedule check
      that.emit('error', err);
    }
  );
};


/*
 * fetch all Route53 zones, build zones -> domains hash
 */
OwnDDNS.prototype.fetchZones = function (nextMarker) {
  var that = this;
  that.client53.listHostedZones(nextMarker ?
      { 'NextMarker': nextMarker } : null, function (err, result) {
    if (err) {
      that.emit('error', err);
    }
    else {
      result.HostedZones.forEach(function (zone) {
        var newZone = false;
        for (var i = 0; i < that.config.dns.domains.length; i++) {
          // first check for FQDN:
          if (that.config.dns.domains[i].slice(-1) !== '.') {
            that.config.dns.domains[i] += '.';
          }
          // zone name ends w/ domain name?
          if (that.config.dns.domains[i].indexOf(zone.Name) ===
              (that.config.dns.domains[i].length - zone.Name.length)) {
            if (that.zonesDomains[zone.Id] === undefined) {
              that.zonesDomains[zone.Id] = [];
              newZone = true;
            }
            that.zonesDomains[zone.Id].push({
              domain: that.config.dns.domains[i],
              active: false
            });
          }
        }
        if (newZone) {
          that.emit('newZone', zone.Id);
        }
      });
    }
    // more zones to scan?
    // TODO: avoid fetch if all domains already have their matching zones
    if (result.IsTruncated) {
      that.fetchZones(result.NextMarker);
    }
  });
};


/*
 * fetch AWS zone records for relevant domains
 */
OwnDDNS.prototype.fetchZone = function (zoneId, nextRecordName) {
  var that = this;
  // TODO: sort zone's domains alphabetically in reverse DNS notation
  // and start w/ nextRecordName = first domain name

  that.client53.listResourceRecordSets({
    HostedZoneId: zoneId,
    StartRecordName: (nextRecordName ? nextRecordName : '')
  }, function (err, result) {
    if (err) {
      that.emit('error', err);
    }
    else {
      result.ResourceRecordSets.forEach(function (recordSet) {
        for (var i = 0; i < that.zonesDomains[zoneId].length; i++) {
          if (recordSet.Name === that.zonesDomains[zoneId][i].domain &&
            recordSet.Type === 'A') {
            that.zonesDomains[zoneId][i].active = true;
            that.zonesDomains[zoneId][i].ttl = recordSet.TTL;
            that.zonesDomains[zoneId][i].rrs = recordSet.ResourceRecords;
          }
        }
      });
      if (result.IsTruncated) {
        that.fetchZone(zoneId, result.NextRecordName);
      }
      else {
        that.emit('zoneLoaded', zoneId);
        that.on('addressChange', function (newIpAddress) {
          that.updateZone(zoneId, newIpAddress);
        });
      }
    }
  });
};
OwnDDNS.prototype.on('newZone', OwnDDNS.prototype.fetchZone);


/*
 * update all relevant domains in given zone w/ new IP address
 */
OwnDDNS.prototype.updateZone = function (zoneId, newIpAddress) {
  var that = this;
  var params = {
    HostedZoneId: zoneId,
    ChangeBatch: {
      Comment: 'OwnDDNS record update',
      Changes: []
    }
  };
  for (var i = 0; i < that.zonesDomains[zoneId].length; i++) {
    if (that.zonesDomains[zoneId][i].active) {
      params.ChangeBatch.Changes.push({
        Action: 'DELETE',
        ResourceRecordSet: {
          Name: that.zonesDomains[zoneId][i].domain,
          Type: 'A',
          TTL: that.zonesDomains[zoneId][i].ttl,
          ResourceRecords: that.zonesDomains[zoneId][i].rrs
        }
      });
    }
    params.ChangeBatch.Changes.push({
      Action: 'CREATE',
      ResourceRecordSet: {
        Name: that.zonesDomains[zoneId][i].domain,
        Type: 'A',
        TTL: that.config.dns.ttl,
        ResourceRecords: [{
          Value: newIpAddress
        }]
      }
    });
  }

  that.client53.changeResourceRecordSets(params, function (err, result) {
    if (err) {
      that.emit('error', err);
    }
    else {
      // change committed, update local data:
      for (var i = 0; i < that.zonesDomains[zoneId].length; i++) {
        that.zonesDomains[zoneId][i].rrs = [{ Value: newIpAddress }];
        that.zonesDomains[zoneId][i].ttl = that.config.dns.ttl;
      }
      that.emit('zoneUpdated', zoneId, newIpAddress);
    }
  });
};


/*
 * main
 */
if (require.main === module) {
  var LOGLEVELS = [ 'DEBUG', 'INFO', 'WARN', 'ERROR' ];
  var config = require('./config.js');
  var logLevel = config.logLevel || process.env.NODE_LOGLEVEL || 'INFO';
  var instance = new OwnDDNS(config);

  var log = function (onLevel, message) {
    if (LOGLEVELS.indexOf(logLevel) <= LOGLEVELS.indexOf(onLevel)) {
      console.log('[' + onLevel + '] ' + message);
    }
  };

  instance.on('zoneUpdated', function (zoneId, newIpAddress) {
    log('INFO', 'Successfully updated ' + zoneId + ' -> ' + newIpAddress);
  });

  instance.on('addressChange', function (newAddress, oldAddress) {
    log('INFO', 'IP Address changed: ' + oldAddress + ' -> ' + newAddress);
  });

  instance.on('addressNoChange', function () {
    log('DEBUG', 'IP address did not change');
  });

  instance.on('newZone', function (zoneId) {
    log('INFO', 'Found new zone: ' + zoneId);
  });

  instance.on('error', function (err) {
    log('ERROR', util.inspect(err, { depth: null }));
  });

  // actually start configuration and monitoring IP address:
  instance.fetchZones();
  // initial check for current IP address:
  setTimeout(instance.detectIpAddress.bind(instance), 10000);
  // regular check:
  setInterval(instance.detectIpAddress.bind(instance), config.pollingInterval);
} else {
  module.exports = OwnDDNS;
}
