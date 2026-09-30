const {chromium}=require('playwright');
const browserOptions=process.env.TEST_BROWSER_PATH?{executablePath:process.env.TEST_BROWSER_PATH}:{channel:'chromium'};
if(process.env.TEST_HEADLESS==='0')browserOptions.headless=false;
module.exports={chromium,browserOptions};
