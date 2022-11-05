const axios = require('axios');
const mailgun = require('mailgun-js');
const {readFileSync, writeFileSync} = require('fs');
const {difference} = require('lodash');
const schedule = require('node-schedule');
require('dotenv').config()

const mg = mailgun({
    apiKey: node.env.MAILGUN_KEY,
    domain: node.env.MAILGUN_DOMAIN,
});

const oldSend = (
    address,
    subject,
    template,
) => {
    return mg.messages().send({
        from: process.env.FROM_EMAIL,
        to: address.join(', '),
        subject: subject,
        html: template
    });
}

const loadCodes = (name) => {
    const list = readFileSync(`./codes/${name}.json`).toString();
    return JSON.parse(list);
}

const saveCodes = (name, codes) => {
    writeFileSync(`./codes/${name}.json`, JSON.stringify(codes));
}

const refunds = async () => {
    const {data} = await axios.get(node.env.REVOKE_URL, {
        responseType: 'blob',
        headers: {
            cookie: node.env.APPSUMO_COOKIES
        }
    });

    const codes = data.split('\n').map(p => p.trim()).filter(f => f);
    const oldCodes = loadCodes('refunds');
    const newCodesToRefund = difference(codes, oldCodes);
    if (newCodesToRefund.length) {
        oldSend([node.env.SEND_TO_EMAILS.split(',')], 'New Refunds', `There are ${newCodesToRefund.length} new refunds: ${newCodesToRefund.join(', ')}`)
        saveCodes('refunds', newCodesToRefund);
        return Promise.all(newCodesToRefund.map((code) => {
            return axios.get(node.env.WEBSITE_REFUND_URL.replace(':code', code))
        }));
    }
}

const newPurchases = async () => {
    const {data} = await axios.get(node.env.REDEEM_URL, {
        responseType: 'blob',
        headers: {
            cookie: node.env.APPSUMO_COOKIES
        }
    });

    const codes = data.split('\n').map(p => p.trim()).filter(f => f);
    const oldCodes = loadCodes('purchases');
    const refunds = loadCodes('refunds');
    const newCodesToRefund = difference(codes, oldCodes);
    if (newCodesToRefund.length) {
        oldSend([node.env.SEND_TO_EMAILS.split(',')], 'New Purchases', `There are ${codes.length - refunds.length} in the system >> ${newCodesToRefund.length} new purchases`);
        saveCodes('purchases', newCodesToRefund);
    }
}

schedule.scheduleJob('* * * * *', async () => {
    return Promise.all([
        newPurchases(),
        refunds()
    ]);
});
