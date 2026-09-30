const {chromium}=require('playwright');
const browserOptions=process.env.TEST_BROWSER_PATH?{executablePath:process.env.TEST_BROWSER_PATH}:{channel:'chromium'};
module.exports={chromium,browserOptions};
