const puppeteer = require('puppeteer')
const credentials = require('./credentials')
const sanitize = require('sanitize-filename')
const _async = require('async')
const path = require('path')
const baseurl = 'https://myuabmedicine.iqhealth.com'

const fs = require('fs')
const outputdir = './outputs'

if (!fs.existsSync(outputdir)) {
  fs.mkdirSync(outputdir)
}

(async () => {
  // Non-headless for now
  //const browser = await puppeteer.launch({ headless: false, args: ['--no-sandbox', '--disable-setuid-sandbox'] })
  const browser = await puppeteer.launch()
  const page = await browser.newPage()

  await page.goto(baseurl + '/home')

  // wait for signin
  const allResultsSelector = '#signin'
  await page.waitForSelector(allResultsSelector)

  // evaluate will run the function in the page context
  await page.evaluate(credentials => {
    document.getElementById('id_login_username').value = credentials.username
    document.getElementById('id_login_password').value = credentials.password
  }, credentials)

  // Click submit button
  await page.click(allResultsSelector)
  await page.waitForNavigation({ waitUntil: 'networkidle0' })

  await page.goto(`${baseurl}/person/${credentials.personid}/health-record/results/?show_all=True`)

  // evaluate will run the function in the page context
  // returns array of categories
  //   category: "Vital Signs"
  //   types: Array(4){testname: "Heart Rate", url: "/person/<redacted>/health-record/results/hist…id=<redacted>&page_size=250"}
  let result = await page.evaluate(_ => {
    return new Promise((resolve, reject) => {
      let shit = [...document.querySelector('#labs > div.section.consumer-float-start').children].flatMap((el) => [...el.getElementsByTagName('li')].flatMap(el => {
        let testname = el.children[0].getElementsByTagName('bdi')[0].innerText
        let url = el.children[1].getAttribute('data-link') + '0'

        return { testname, url }
      }))

      resolve(shit)
    })
  })

  let allLabs = []

  console.log(result)

  _async.eachSeries(result, async (test) => {
    let navigateTo = baseurl + test.url
    console.log(`Navigating to: ${navigateTo}`)
    await page.goto(navigateTo)

    let labresults = []
    labresults = await page.evaluate(_ => {
      return new Promise((resolve, reject) => {
        let shit = [...document.querySelector('#labs > div > div.consumer-card.section > ul').getElementsByTagName('li')].map((el) => {
          let bdis = el.getElementsByTagName('bdi')
          let date = el.getElementsByClassName('date')[0].innerText
          let time = el.getElementsByClassName('time')[0].innerText
          let result = ''
          let ref = ''

          if (bdis.length > 0)
            result = bdis[0].innerText

          if (bdis.length === 3)
            ref = bdis[2].innerText

          if (bdis.length === 4)
            ref = bdis[3].innerText

          return { result, date, time, ref }
        })

        resolve(shit)
      })
    })

    let formatted = {
      testname: test.testname,
      results: labresults
    }

    allLabs.push(formatted)

    try {
      let filename = `${outputdir}/${sanitize(test.testname)}.json`
      fs.writeFileSync(filename, JSON.stringify(formatted))
    } catch (err) {
      console.error(err)
    }

  }, (err, result) => {
    console.log('Done processing')

    console.log(allLabs)

    try {
      let filename = `${outputdir}/all.json`
      fs.writeFileSync(filename, JSON.stringify(allLabs))
    } catch (err) {
      console.error(err)
    }

    browser.close()
  })
})()