import { env } from './env';
import { chromium } from 'rebrowser-playwright';
import { writeFile, mkdir } from 'fs/promises';
import { createReadStream, existsSync, ReadStream } from 'fs';
import OpenAI from 'openai';

main()
  .then(() => {
    console.log('Done')
    process.exit(0)
  })
  .catch(e => {
    console.error('Error: ', e)
    process.exit(1)
  });

  const openai = new OpenAI({ apiKey: env.OPEN_API_KEY });

  const TEXT_TO_NUMBERS_MAP = {
    'zero': 0,
    'one': 1,
    'two': 2,
    'three': 3,
    'four': 4,
    'five': 5,
    'six': 6,
    'seven': 7,
    'eight': 8,
    'nine': 9,
  } as { [key: string]: number };

async function main() {
  const browser = await chromium.launch({ 
    headless: env.CI, 
    slowMo: 3000,
    channel: 'chrome',
    args: [
      '--disable-blink-features=AutomationControlled',
    ],
  });

  const context = await browser.newContext({
    viewport: null,
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
  });

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
      await loginPage.waitForURL(/nytimes/i, { timeout: 300_000 });
      await loginPage.waitForLoadState('networkidle');
    
      await loginPage.addLocatorHandler(loginPage.locator('#complianceOverlay'), async locator => {
        const continueButton = locator.getByRole('button', { name: /continue/i });
        await continueButton.click();
      });

      console.log('Logging in to NYT');
      await loginPage.screenshot({ path: 'screenshots/3.png' });
      await loginPage.getByTestId('login-lnk').click();
      await loginPage.waitForLoadState('networkidle');

      const captchaFrame = loginPage.frameLocator('iframe');
      const captchaText = captchaFrame.getByText(/confirm that you are human/i);
      const captchaTextVisible = await captchaText.isVisible();

      if (captchaTextVisible) {
        console.log('Captcha detected');

        const audioButton = captchaFrame.locator('#captcha__audio__button');
        const playButton = captchaFrame.locator('.audio-captcha-play-button');
        const audio = captchaFrame.locator('.audio-captcha-track');
        

        await audioButton.click();
        await playButton.click();
        const audioSrc = await audio.getAttribute('src');

        if (audioSrc === null) {
          throw new Error('No audio src found');
        }

        const audioResponse = await loginPage.request.get(audioSrc);
        const audioFileName = audioSrc.split('/').pop();
        const audioData = await audioResponse.body();
        const audioDirectory = `${process.cwd()}/audio`;

        if (existsSync(audioDirectory) === false) {
          await mkdir(audioDirectory);
        }

        const filePath = `${audioDirectory}/${audioFileName}`;
        await writeFile(filePath, audioData);

        const result = await getNumbers(filePath);
        
        console.log('Solving captcha:');
        console.log('Transcription:', result.transcription.text);
        console.log('Numbers:', result.numbers);

        await loginPage.waitForTimeout(15_000);

        for (const [index, number] of result.numbers.entries()) {
          await captchaFrame.locator('.audio-captcha-inputs').nth(index).pressSequentially(number.toString(), { delay: 1000 });
        }
      }
      
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


async function getNumbers(filePath: string, attempts = 0) {
  if (attempts == 10) {
    throw new Error('Error transcribing audio: Max retries exceeded');
  }

  try {
    const transcription = await openai.audio.transcriptions.create({
      file: createReadStream(filePath),
      model: 'whisper-1'
    });
    
    const numbers = transcription.text
      .replace(/\./g,' ')
      .toLowerCase()
      .split(' ')
      .map(word => TEXT_TO_NUMBERS_MAP[word])
      .filter(num => num !== undefined);

    if (numbers.length === 0) {
      console.log('No numbers found in transcription. Retrying...');
      return getNumbers(filePath, attempts + 1);
    }

    return { numbers, transcription };
  } catch (e) {
    console.error('Error transcribing audio:', e);
    return getNumbers(filePath, attempts + 1);
  }
}