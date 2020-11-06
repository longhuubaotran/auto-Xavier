const express = require('express');
const app = express();
const socket = require('socket.io');
const puppeteer = require('puppeteer');
const nodemailer = require('nodemailer');
const PORT = process.env.PORT || 5000;

const server = app.listen(PORT, () => {
  console.log('server online');
});

const io = socket(server);
let autoScan = false;

io.on('connection', async (socket) => {
  console.log('client connected');
  socket.on('executeAuto', async function (data) {
    console.log('data', data);

    autoScan = data.autoScan;
    while (autoScan) {
      executeAuto(data, data.links[0]);
      await sleep(60000);
    }
  });

  socket.on('disconnect', (data) => {
    autoScan = false;
  });

  socket.on('stopAuto', () => {
    autoScan = false;
  });
});

async function executeAuto(data, url) {
  const time = new Date().toLocaleString();
  let pickupOp = false;
  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--disable-gpu',
      '--proxy-server="direct://"',
      '--proxy-bypass-list=*',
    ],
  });
  ///
  try {
    const page = await browser.newPage();

    const blockedResourceTypes = [
      'image',
      'media',
      'font',
      'texttrack',
      'object',
      'beacon',
      'csp_report',
      'imageset',
    ];
    const skippedResources = [
      'quantserve',
      'adzerk',
      'doubleclick',
      'adition',
      'exelator',
      'sharethrough',
      'cdn.api.twitter',
      'google-analytics',
      'googletagmanager',
      'google',
      'fontawesome',
      'facebook',
      'analytics',
      'optimizely',
      'clicktale',
      'mixpanel',
      'zedo',
      'clicksor',
      'tiqcdn',
    ];

    await page.setRequestInterception(true);
    await page.setUserAgent(
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/78.0.3904.108 Safari/537.36'
    );
    page.on('request', (request) => {
      const requestUrl = request._url.split('?')[0].split('#')[0];
      if (
        blockedResourceTypes.indexOf(request.resourceType()) !== -1 ||
        skippedResources.some((resource) => requestUrl.indexOf(resource) !== -1)
      ) {
        request.abort();
      } else {
        request.continue();
      }
    });

    await page.goto(url);

    await page.waitForSelector('[data-test="flexible-fulfillment"]');

    const orderBtn = await page.$$(
      '.Button__ButtonWithStyles-y45r97-0.styles__StyledButton-sc-1f2lsll-0.eLsRDh.iyUhph'
    );

    if (orderBtn.length === 0) {
      io.emit('result', { msg: `${time}: Not Found: ${url}` });
      await browser.close();
      return;
    } else {
      for (let i = 0; i < orderBtn.length; i++) {
        let text = await page.evaluate((el) => el.innerText, orderBtn[i]);
        if (text === 'Pick it up') {
          await orderBtn[i].click();
          pickupOp = true;
          break;
        } else {
          text = await page.evaluate(
            (el) => el.innerText,
            orderBtn[orderBtn.length - 1]
          );
          if (text === 'Ship it') {
            await orderBtn[orderBtn.length - 1].click();
            break;
          }
        }
      }
    }

    await sleep(500);
    const errorBtn = await page.$('[data-test="errorContent-okButton"]');
    if (errorBtn && errorBtn.textContent !== '') {
      io.emit('result', { msg: `${time}: Not Found: ${url}` });
      await browser.close();
      return;
    }

    await page.waitForSelector('[data-test="addToCartModal"]');

    const declineBtn = await page.$(
      '[data-test="espModalContent-declineCoverageButton"]'
    );

    if (declineBtn && declineBtn.textContent !== '') {
      await page.click('[data-test="espModalContent-declineCoverageButton"]');
    }

    await page.click('[data-test="addToCartModalViewCartCheckout"]');

    await page.waitForSelector('[data-test="checkout-button"]');
    await page.click('[data-test="checkout-button"]');

    await page.waitForSelector('[id="username"]', { visible: true });
    await page.focus('[id="username"]');
    await page.keyboard.type(data.email);

    await page.focus('[id="password"]');
    await page.keyboard.type(data.password);

    await page.click('[id="login"]');

    await page.waitForSelector('[id="checkout-spinner"]', {
      hidden: true,
    });

    if (pickupOp) {
      await page.waitForSelector('[id="creditCardInput-cvv"]');
      await page.type('[id="creditCardInput-cvv"]', `${data.ccv}`);
      await page.waitForSelector('[data-test="placeOrderButton"]');
      await page.click('[data-test="placeOrderButton"]');
    } else {
      await page.waitForSelector('[data-test="payment-credit-card-section"]', {
        visible: true,
      });

      const addNewCard = await page.$(
        '[data-test="add-new-credit-card-button"]'
      );

      if (addNewCard && addNewCard.textContent !== '') {
        await page.waitForSelector('[id="creditCardInput-cardNumber"]');
        await page.type('[id="creditCardInput-cardNumber"]', `${data.cardNum}`);
        await page.click('[data-test="verify-card-button"]');
        await page.waitForSelector('[id="creditCardInput-cvv"]');
        await page.type('[id="creditCardInput-cvv"]', `${data.ccv}`);
      }

      await page.click('[data-test="save-and-continue-button"]');

      await page.waitForSelector('[id="checkout-spinner"]', {
        hidden: true,
      });
      await page.waitForSelector('[data-test="placeOrderButton"]');
      await page.click('[data-test="placeOrderButton"]');
    }

    await sleep(3000);
    autoScan = false;
    await browser.close();
    io.emit('result', { msg: `${time}: Auto Checkout Successfully: ${url}` });
    sendMail(data, url);
  } catch (error) {
    io.emit('result', { msg: 'Error from Target.com' });
    console.log(error);
  } finally {
    await browser.close();
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sendMail(data, url) {
  var transport = nodemailer.createTransport({
    service: 'gmail',
    host: 'smtp.gmail.com',
    port: 587,
    auth: {
      user: 'baolongtranfifa2@gmail.com',
      pass: 'Angiday4680?',
    },
    secure: 'false',
    tls: {
      rejectUnauthorized: false,
    },
  });

  var mailOptions = {
    from: 'baolongtranfifa2@gmail.com',
    to: 'baolongtran512@gmail.com',
    subject: 'Ps5 Checkout Successfully',
    text: `User: ${data.cardName} 
    Checkout ${url} -- successfully`,
  };

  transport.sendMail(mailOptions, (error, info) => {
    if (error) {
      return console.log(error);
    }
    console.log('Message sent: %s', info.messageId);
  });
}
