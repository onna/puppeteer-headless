const puppeteer = require('puppeteer');
const argv = require('minimist')(process.argv.slice(2));
const file = require('mz/fs');

var browser;


// Listen on 3000 for screenshot requests
startServer();


async function startServer() {
    var express = require('express'),
        app = express(),
        port = process.env.PORT || 3000;

    var bodyParser = require('body-parser');
    app.use(bodyParser.json());
    app.use(bodyParser.urlencoded({
        extended: true
    }));

    // Start the Chrome Debugging Protocol
    browser = await puppeteer.launch({
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    console.log('Puppeteer screenshot server started on: ' + port);

    app.get('/', (request, response) => {
        response.send('OK')
    })


    // Check our browser is still alive
    app.get('/healthcheck', async (request, response) => {

        const page = await browser.newPage();

        try {
            await page.goto("about:blank"), {
                waitUntil: 'networkidle2'
            }

            await page.close();
            response.send('OK')

        } catch (err) {
            if (page) {
                await page.close();
            }
            console.error('Exception while taking screenshot:', err);
            return 400;
        }
    })


    app.post('/screenshot', async function(request, response) {

        url = request.body.url;

        const format = request.body.format === 'jpeg' ? 'jpeg' : 'png'
        const outputDir = request.body.output_dir || './';
        const output = request.body.output || `output.${format === 'png' ? 'png' : 'jpg'}`;
        const userAgent = request.body.user_agent || 'puppeteer';
        const viewportHeight = request.body.viewport_height || 900;
        const viewportWidth = request.body.viewport_width || 1920;
        const pageLoadDelay = request.body.page_load_delay || 0;
        const host = request.body.host;
        const cookies = request.body.cookies;
        const headers = request.body.headers;
        const pdf = request.body.pdf === true ? true : false;
        const fullPage = request.body.full_page === true ? true : false;
        const landscape = request.body.landscape === true ? true: false;

        console.log(pdf)

        sc_response = await takeScreenshot(url, outputDir, output, viewportHeight, viewportWidth,
            format, userAgent, pageLoadDelay, host, cookies, headers, pdf, fullPage, landscape);
        response.sendStatus(sc_response)
    })

    app.listen(port, (err) => {
        if (err) {
            return console.log('Could not start puppeteer server', err)
        }
    })
}


async function takeScreenshot(url, outputDir, output, viewportHeight, viewportWidth, format, userAgent,
     pageLoadDelay, host, cookies, headers, pdf, fullPage, landscape) {

    const page = await browser.newPage();

    try {


        //node chrome.js --url= --output=b152988d320.pdf --pdf --full --host= --cookies="{\"token\":\"eyJraWQiO\"}"
        if (cookies && host) {
            // Add cookies from the received cookie JSON object
            const cookiesObj = JSON.parse(cookies);

            for (var key in cookiesObj) {
                await page.setCookie({
                    name: key,
                    value: cookiesObj[key],
                    url: host
                });
            }
        }

        //node chrome.js --url= --output=9b152988d320.png --full --headers="{\"Authorization\":\"Bearer eyJ0eXAiOiJKV1\"}"
        if (headers) {
            // Add basic auth info
            await page.setExtraHTTPHeaders(JSON.parse(headers));
        }

        // Navigate to target page
        await page.goto(url, {
            waitUntil: 'networkidle2'
        });

        // Wait for body to load
        await page.waitForSelector("body");

        // sleep...
        await (new Promise(resolve => setTimeout(resolve, pageLoadDelay)));

        const newHeight = await page.evaluate(() => document.body.offsetHeight);
        const newWidth = await page.evaluate(() => document.body.offsetWidth);
        if (newHeight < viewportHeight) {
            viewportHeight = newHeight;
        }
        if (newWidth < newWidth) {
            viewportWidth = newWidth;
        }
        await page.setViewport({
            width: viewportWidth,
            height: viewportHeight
        });

        const output_path = `${outputDir + output}`;

        if (pdf) {
            try {
                page.evaluate(_ => {
                    window.scrollTo(0, document.body.scrollHeight);
                });
            } catch (err) {
                console.warn('Could not scroll to end of page');
            }
            // Generates a PDF with 'screen' media type.
            await page.emulateMedia('screen');

            await page.pdf({
                path: output_path,
                landscape: landscape,
                printBackground: true
            });

            console.log('PDF Printed with Chrome as ' + output_path);
        } else {
            //console.log(fullPage);

            const screenshot = await
            page.screenshot({
                path: output_path,
                type: format,
                fullPage: fullPage
            });
            console.log('Screenshot saved as ' + output_path);
        }

        await page.close();
        return 200;

    } catch (err) {
        if (page) {
            await page.close();
        }
        console.error('Exception while taking screenshot:', err);
        return 400;
    }
}