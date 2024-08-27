import { env } from './env';
import { chromium } from 'playwright-extra'; // extends playwright with plugin ability
import stealth from 'puppeteer-extra-plugin-stealth'; // stealth plugin to avoid bot detection

main()
  .then(() => {
    console.log('Done')
    process.exit(0)
  })
  .catch(e => {
    console.error('Error: ', e)
    process.exit(1)
  });

async function main() {
  chromium.use(stealth()); // use stealth plugin

  const browser = await chromium.launch({ headless: env.CI, slowMo: 3000 });
  const context = await browser.newContext();
  const initialPage = await context.newPage();

  const maxAttempts = 1;
  let attempts = 0;

  while (attempts < maxAttempts) {
    console.log(`Attempt ${attempts + 1} of ${maxAttempts}`);

    try {
      console.log('Navigating to library website');
      await initialPage.goto('https://www.olathelibrary.org/online-resources/online-entertainment#enewspapers', { timeout: 300_000 });
      await initialPage.screenshot({ path: 'screenshots/1.png' });

      console.log('Clicking on New York Times');
      const libLoginPagePromise = context.waitForEvent('page');
      await initialPage.getByRole('link', { name: /new york times/i }).click();
      const loginPage = await libLoginPagePromise;

      console.log('Logging in to library');
      await loginPage.screenshot({ path: 'screenshots/2.png' });
      await loginPage.getByLabel('Username or Barcode:').pressSequentially(env.LIB_USERNAME, { delay: 150 });
      await loginPage.getByLabel('PIN/Password :').pressSequentially(env.LIB_PASSWORD, { delay: 150 });
      await loginPage.getByRole('button', { name: /log in/i }).click();
      await loginPage.waitForURL(/nytimes/i);
      await loginPage.waitForLoadState('networkidle');

      console.log('Logging in to NYT');
      await loginPage.screenshot({ path: 'screenshots/3.png' });
      await loginPage.getByTestId('login-lnk').click();
      await loginPage.waitForURL(/myaccount\.nytimes/i);
      await loginPage.waitForLoadState('networkidle');
      await loginPage.screenshot({ path: 'screenshots/4.png' });

      await loginPage.getByLabel('Email Address').pressSequentially(env.NY_USERNAME, { delay: 150 });
      await loginPage.getByTestId('submit-email').click();
      await loginPage.getByLabel('Password', { exact: true }).pressSequentially(env.NY_PASSWORD, { delay: 150 });
      await loginPage.getByTestId('login-button').click();
      await loginPage.screenshot({ path: 'screenshots/5.png' });

      const confirmationText = loginPage.getByText(/set a calendar reminder to renew/i);
      const confirmationTextVisible = await confirmationText.isVisible();
    
      if (confirmationTextVisible) {
        console.log('Successfully renewed NYT subscription');
      } else {
        console.log('Failed to renew NYT subscription');
      }

      break;
    }
    catch (e) {
      if (attempts === 2) {
        throw e;
      }
      
      console.error('Error: ', e);
      attempts++;
    }
  }
}
