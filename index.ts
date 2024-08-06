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

  console.log('Navigating to library website');
  await initialPage.goto('https://www.olathelibrary.org/online-resources/online-entertainment#enewspapers');

  console.log('Clicking on New York Times');
  const libLoginPagePromise = context.waitForEvent('page');
  await initialPage.getByRole('link', { name: /new york times/i }).click();
  const loginPage = await libLoginPagePromise;

  console.log('Logging in to library');
  await loginPage.getByLabel('Username or Barcode:').pressSequentially(env.LIB_USERNAME, { delay: 150 });
  await loginPage.getByLabel('PIN/Password :').pressSequentially(env.LIB_PASSWORD, { delay: 150 });
  await loginPage.getByRole('button', { name: /log in/i }).click();
  await loginPage.waitForURL(/nytimes/i);

  console.log('Logging in to NYT');
  await loginPage.getByTestId('login-lnk').click();
  await loginPage.waitForURL(/myaccount\.nytimes/i);
  await loginPage.getByLabel('Email Address').pressSequentially(env.NY_USERNAME, { delay: 150 });
  await loginPage.getByTestId('submit-email').click();
  await loginPage.getByLabel('Password', { exact: true }).pressSequentially(env.NY_PASSWORD, { delay: 150 });
  await loginPage.getByTestId('login-button').click();
  await loginPage.waitForLoadState('networkidle');

  const confirmationText = loginPage.getByText(/set a calendar reminder to renew/i);
  const confirmationTextVisible = await confirmationText.isVisible();

  if (confirmationTextVisible) {
    console.log('Successfully renewed NYT subscription');
  } else {
    console.log('Failed to renew NYT subscription');
  }
}