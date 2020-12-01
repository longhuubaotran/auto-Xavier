const express = require('express');
const app = express();
const socket = require('socket.io');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const UserAgent = require('user-agents');
const PORT = process.env.PORT || 5000;

puppeteer.use(StealthPlugin());

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
      try {
        await executeAuto(data, data.links[0]);
      } catch (error) {
        console.log(error);
      }
      console.log(autoScan, 'AutoScan');
      await sleep(40000);
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
      '--window-size=1920,1080',
    ],
    defaultViewport: null,
  });
  ///
  try {
    const userAgent = new UserAgent();
    const page = await browser.newPage();

    await page.setDefaultTimeout(9000000);

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
    await page.setUserAgent(userAgent.toString());
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

    await page.goto(url, { waitUntil: 'domcontentloaded' });

    const orderBtn = await page.$$(
      '[data-tl-id="ProductPrimaryCTA-cta_add_to_cart_button"]'
    );

    if (orderBtn.length === 0) {
      io.emit('result', { msg: `${time}: Not Found: ${url}` });
      await browser.close();
      autoScan = true;
      return;
    } else {
      await orderBtn[0].click();
    }
    await sleep(500);
    await page.waitForSelector('[data-tl-id="IPPacCheckOutBtnBottom"]');
    await page.click('[data-tl-id="IPPacCheckOutBtnBottom"]');

    await page.waitForSelector('[tealeafid="signin-email-input"]', {
      visible: true,
    });
    await page.focus('[tealeafid="signin-email-input"]');
    await page.keyboard.type(data.email);
    // await sleep(500);
    await page.focus('[data-automation-id="signin-password-input"]');
    await page.keyboard.type(data.password);
    await sleep(500);
    await page.click('[data-automation-id="signin-submit-btn"]');
    // await sleep(500);
    await page.waitForSelector('[data-automation-id="fulfillment-continue"]');
    await page.click('[data-automation-id="fulfillment-continue"]');
    // await sleep(500);
    await page.waitForSelector(
      '[data-automation-id="address-book-action-buttons-on-continue"]'
    );
    await page.click(
      '[data-automation-id="address-book-action-buttons-on-continue"]'
    );
    // await sleep(500);
    await page.waitForSelector('[data-automation-id="cvv-verify-cc-0"]');
    await page.type('[data-automation-id="cvv-verify-cc-0"]', `${data.ccv}`);
    // await sleep(500);
    await page.waitForSelector('[data-automation-id="submit-payment-cc"]');
    await page.click('[data-automation-id="submit-payment-cc"]');

    await page.waitForSelector('[data-automation-id="summary-place-holder"]');
    await page.click('[data-automation-id="summary-place-holder"]');

    await sleep(2000);
    await browser.close();
    autoScan = false;
    io.emit('result', { msg: `${time}: Auto Checkout Successfully: ${url}` });
    return;
  } catch (error) {
    io.emit('result', { msg: 'Not response from Walmart' });
    console.log(error);
    autoScan = true;
    return;
  } finally {
    await browser.close();
    return;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
