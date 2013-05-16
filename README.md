# ownDDNS

Your own dynamic DNS service (Node.js/AWS-based)

## Requirements

- Node.js
- one (or more) DNS domains (registered at a registrar with full DNS access)
- active [Amazon Web Services (AWS)](http://aws.amazon.com/) account

## Installation

    $ git clone git://github.com/tmuellerleile/ownddns.git
    $ cd ownddns
    $ npm install

## Usage

1. Create hosted zones/domains in the AWS Route 53 console as described in [this tutorial](http://docs.aws.amazon.com/Route53/latest/DeveloperGuide/R53Example.html), make sure to create an A-type record for each domain.

2. Create AWS Access Keys as described in [this document](http://docs.aws.amazon.com/AWSSecurityCredentials/1.0/AboutAWSCredentials.html#AccessKeys).

3. Copy the `config.sample.js` file, rename it to `config.js` and enter your Access Key ID and Secret Access Key (see step 2) and your Route 53-based domains (see step 1). You can customize the default DNS record TTL and IP address change polling interval, too.

4. `node index.js`(and make sure it keeps running by means of your operating system, which is beyond the scope of this document)

## License

MIT (see LICENSE)

## Issues/Contributions

Very welcome!
