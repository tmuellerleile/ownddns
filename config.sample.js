module.exports = {
  aws: {
    credentials: {
      secretAccessKey: 'your-secret-access-key-here',
      accessKeyId: 'your-key-id-here'
    },
    region: 'route53.amazonaws.com' // you almost certainly don't want to change
                                    // this
  },
  dns: {
    domains: [ 'my.domain.here', 'my.other.domain.there' ],
    ttl: 600
  },
  pollingInterval: 600 * 1000
};
