const puppeteer = require('puppeteer');
const credentials = require('./credentials');

const _async = require("async");

const baseurl = 'https://myuabmedicine.iqhealth.com';

(async () => {
    // Non-headless for now
    const browser = await puppeteer.launch({ headless: false, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();

    await page.goto(baseurl+'/home');

    // wait for signin
    const allResultsSelector = '#signin';
    await page.waitForSelector(allResultsSelector);

    // evaluate will run the function in the page context
    await page.evaluate(credentials => {
        document.getElementById("id_login_username").value = credentials.username;
        document.getElementById("id_login_password").value = credentials.password;
    }, credentials);


    // Click submit button
    await page.click(allResultsSelector);
    await page.waitForNavigation({ waitUntil: 'networkidle0' })

    await page.goto(`${baseurl}/person/${credentials.personid}/health-record/results/?show_all=True`);

    // evaluate will run the function in the page context
    // returns array of categories
    //   category: "Vital Signs"
    //   types: Array(4){testname: "Heart Rate", url: "/person/<redacted>/health-record/results/hist…id=<redacted>&page_size=250"}
    let result = await page.evaluate(_ => {
        return new Promise((resolve, reject) => {
            let shit = [...document.querySelector("#labs > div.section.consumer-float-start").children].flatMap((el) => [...el.getElementsByTagName("li")].flatMap(el => {
                let testname = el.children[0].getElementsByTagName("bdi")[0].innerText
                let url = el.children[1].getAttribute("data-link") + "0"
            
                return {testname, url} 
            }))


            resolve(shit)
        })
    });

    let allLabs = []

    _async.eachSeries(result, async (test, done) => {
        await page.goto(baseurl + test.url);

        let result = await page.evaluate(_ => {
            return new Promise((resolve, reject) => {
                let shit =     [...document.querySelector("#labs > div > div.consumer-card.section > ul").getElementsByTagName("li")].slice(1).map((el) => {
                    let result = el.getElementsByTagName("bdi")[0].innerText
                    let date = el.getElementsByClassName("date")[0].innerText
                
                    return {result, date}
                })
    
                resolve(shit)
            })
        });


        let formatted = {
            testname: test.testname,
            results: result
        }

        allLabs.push(formatted)

        console.log(formatted)


        done(result)
    }, (err, result) => {
        console.log('Done processing')

        console.log(allLabs)

        browser.close();
    })
})();