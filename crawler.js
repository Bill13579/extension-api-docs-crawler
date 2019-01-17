const puppeteer = require("puppeteer");
const fs = require("fs");
const apiMap = {};

function buildObject(kvPairs) {
    let obj = {};
    for (let pair of kvPairs) {
        obj[pair[0]] = pair[1];
    }
    return obj;
}

async function crawlFunctions(page, api, functions) {
    apiMap[api.name].functions = {};
    for (let func of functions) {
        console.log("[MDN] Crawling Function '" + api.name + "." + func.name + "()'");
        await page.goto(func.href);
        const async = await page.evaluate(() => {
            let returnValue = document.querySelector("#Return_value + p > code");
            return returnValue ? returnValue.textContent.trim().toUpperCase() === "PROMISE" : null;
        });
        apiMap[api.name].functions[func.name] = {
            async: async,
            void: async === null,
            deprecated: func.deprecated,
            experimental: func.experimental
        };
    }
}

async function crawlChrome(page, apiName, api) {
    await page.goto("https://developer.chrome.com/extensions/" + apiName);
    console.log("[Chrome] Crawling '" + apiName + "' Api Types");
    for (let typeName in api.types) {
        api.types[typeName].availableInChrome = await page.evaluate(typeName => {
            return document.querySelector("#type-" + typeName) !== null;
        }, typeName);
    }
    console.log("[Chrome] Crawling '" + apiName + "' Api Properties");
    for (let propertyName in api.properties) {
        api.properties[propertyName].availableInChrome = await page.evaluate(propertyName => {
            return document.querySelector("#property-" + propertyName) !== null;
        }, propertyName);
    }
    console.log("[Chrome] Crawling '" + apiName + "' Api Functions");
    for (let functionName in api.functions) {
        api.functions[functionName].availableInChrome = await page.evaluate(functionName => {
            return document.querySelector("#method-" + functionName) !== null;
        }, functionName);
    }
    console.log("[Chrome] Crawling '" + apiName + "' Api Events");
    for (let eventName in api.events) {
        api.events[eventName].availableInChrome = await page.evaluate(eventName => {
            return document.querySelector("#event-" + eventName) !== null;
        }, eventName);
    }
}

async function crawlApis_MDN(page, apis) {
    for (let api of apis) {
        console.log("[MDN] Crawling API '" + api.name + "'");
        await page.goto(api.href);
        apiMap[api.name] = {};
        const all = await page.evaluate(() => {
            function last(array) {
                return array.length > 0 ? array[array.length - 1] : undefined;
            }
            const types = Array.from(document.querySelectorAll("#Types + dl > dt > a")).map(type => {
                return {
                    name: last(type.textContent.split(".")),
                    href: type.href
                };
            });
            const properties = Array.from(document.querySelectorAll("#Properties + dl > dt > a")).map(property => {
                return {
                    name: last(property.textContent.split(".")),
                    href: property.href
                };
            });
            const functions = Array.from(document.querySelectorAll("#Functions + dl > dt > a")).map(func => {
                let icon = func.parentElement.querySelector("span i");
                return {
                    name: last(func.textContent.split(".")).replace("()", ""),
                    deprecated: icon ? icon.classList.contains("icon-thumbs-down-alt") : false,
                    experimental: icon ? icon.classList.contains("icon-beaker") : false,
                    href: func.href
                };
            });
            const events = Array.from(document.querySelectorAll("#Events + dl > dt > a")).map(event => {
                return {
                    name: last(event.textContent.split(".")),
                    href: event.href
                };
            });
            return {
                types: types.length > 0 ? types : undefined,
                properties: properties.length > 0 ? properties : undefined,
                functions: functions.length > 0 ? functions : undefined,
                events: events.length > 0 ? events : undefined
            };
        });
        if (all.types) apiMap[api.name].types = buildObject(all.types.map(type => [type.name, {}]));
        if (all.properties) apiMap[api.name].properties = buildObject(all.properties.map(property => [property.name, {}]));
        if (all.functions) await crawlFunctions(page, api, all.functions);
        if (all.events) apiMap[api.name].events = buildObject(all.events.map(event => [event.name, {}]));
        await crawlChrome(page, api.name, apiMap[api.name]);
    }
}

(async () => {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    await page.goto("https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API");
    const apis = await page.evaluate(() => {
        return Array.from(document.querySelectorAll("dt.landingPageList > a")).map(api => {
            return {
                name: api.textContent.trim(),
                href: api.href
            };
        });
    });
    await crawlApis_MDN(page, apis);
    console.log("Writing to file");
    fs.writeFileSync("api-docs.json", JSON.stringify(apiMap));
    console.log("Done!");
    process.exit(0);
})();
