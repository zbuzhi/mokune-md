// Linux CI exercises this macOS app's Command-key bindings. This only changes
// platform detection for keyboard tests; it does not emulate macOS rendering or IME.
export async function createTestPage(browser,options={}){
 const page=await browser.newPage(options);
 const platform=process.env.MOKUNE_BROWSER_PLATFORM;
 if(platform){
  if(platform!=='MacIntel')throw Error('Unsupported browser test platform');
  await page.addInitScript(platform=>Object.defineProperty(navigator,'platform',{get:()=>platform}),platform);
 }
 return page;
}
