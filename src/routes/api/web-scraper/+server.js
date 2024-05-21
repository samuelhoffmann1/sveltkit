import { dev } from '$app/environment';
import {
	LOCAL_CHROMIUM_PATH,
	CHROMIUM_DOWNLOAD_URL,
	BLOB_READ_WRITE_TOKEN
} from '$env/static/private';
import { put } from '@vercel/blob';
import chromium from '@sparticuz/chromium-min';
import puppeteer from 'puppeteer-core';
import { json } from '@sveltejs/kit';

/** @type {import('@sveltejs/kit').RequestHandler} */
export async function POST({ request }) {
	const { url } = await request.json();

	try {
		const screenshot = await takeScreenshot(url);
		const imageURL = await uploadImage(screenshot, url);
		return json({ success: true, imageURL });
	} catch (/** @type {any}*/ e) {
		return json({ success: false, error: e?.message});
	}
}

/**
 * Takes a screenshot of the page at the given URL with Puppeteer and returns the image Buffer
 * @param {string} pageURL
 * @returns {Promise<Buffer>}
 */
async function takeScreenshot(pageURL) {
	const browser = await puppeteer.launch({
		args: chromium.args,
		defaultViewport: chromium.defaultViewport,
		executablePath: dev ? LOCAL_CHROMIUM_PATH : await chromium.executablePath(CHROMIUM_DOWNLOAD_URL)
	});

	const page = await browser.newPage();
	page.setDefaultNavigationTimeout(60 * 1000);

	// This try/catch block handles the cases where the page fails to load but returns a valid HTTP status as well
	// as the case where the goto() function throws an error (e.g. due to a timeout)
	try {
		const response = await page.goto(pageURL);
		if (response && !response.ok) {
			await browser.close();
			console.warn(`Failed to load page: ${response.status()} ${response.statusText()}`);
			throw new Error(`Failed to load page: ${response.status()} ${response.statusText()}`);
		}
	} catch (/** @type {any}*/ e) {
		await browser.close();
		console.warn(`Failed to load page: ${e?.message}`);
		throw new Error(`Failed to load page: ${e?.message}`);
	}

	const screenshot = await page.screenshot({
		type: 'webp',
		captureBeyondViewport: false
	});
	await browser.close();
	return screenshot;
}

/**
 * Uploads the image to vercel blob storage and returns the image url
 * @param {Buffer} buffer
 * @param {string} pageURL
 * @returns {Promise<string>}
 */
async function uploadImage(buffer, pageURL) {
	const pathName = trimUrl(pageURL);
	const { url } = await put(`screenshots/${pathName}`, buffer, {
		access: 'public',
		token: BLOB_READ_WRITE_TOKEN,
		contentType: 'image/webp'
	});

	return url;
}

/**
 * Trims http protocol and any trailing slashes from the url to prevent extra folder creation in vercel blob storage
 * @param {string} pageURL
 * @returns {string}
 */
function trimUrl(pageURL) {
	// Remove leading protocol
	let trimmedUrl = pageURL.replace(/(^\w+:|^)\/\//, '');
	// Remove trailing slashes
	trimmedUrl = trimmedUrl.replace(/\/+$/, '');
	return trimmedUrl;
}
