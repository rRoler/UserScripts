// ==UserScript==
// @name         MangaDex Add Info
// @namespace    https://github.com/rRoler/UserScripts
// @version      1.0.0
// @description  Add some additional local information to MangaDex title pages. !! DATA IS STORED INSIDE USERSCRIPT STORAGE !!
// @author       Roler
// @icon         https://www.google.com/s2/favicons?sz=64&domain=mangadex.org
// @match        https://mangadex.org/*
// @match        https://canary.mangadex.dev/*
// @match        https://demo.komga.org/*
// @updateURL    https://github.com/rRoler/UserScripts/raw/master/mangadex-add-info.user.js
// @downloadURL  https://github.com/rRoler/UserScripts/raw/master/mangadex-add-info.user.js
// @supportURL   https://github.com/rRoler/UserScripts/issues
// @require      https://cdnjs.cloudflare.com/ajax/libs/validator/13.12.0/validator.min.js#sha256-d2c75e3159ceac9c14dcc8a7aeb09ea30970de6c321c89070e5b0157842c5c88
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_setClipboard
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    const sections = [
        {
            id: 'links',
            name: 'Link',
            type: 'url'
        },
        {
            id: 'tags',
            name: 'Tag',
            type: 'text',
            onclick: (event, tag) => {
                event.preventDefault();
                event.stopPropagation();

                GM_setClipboard(tag);
            }
        },
        {
            id: 'titles',
            name: 'Title',
            type: 'text',
            onclick: (event, title) => {
                event.preventDefault();
                event.stopPropagation();

                GM_setClipboard(title);
            }
        },
        {
            id: 'notes',
            name: 'Note',
            type: 'text',
            onclick: (event, note) => {
                event.preventDefault();
                event.stopPropagation();

                alert(note);
            }
        }
    ];

    const getMdTitleId = (url = window.location.href) => {
        const titleIdMatch = url.match(/\/title\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/);
        return titleIdMatch && titleIdMatch[1];
    }

    const getKomgaSeriesId = (url = window.location.href) => {
        const seriesIdMatch = url.match(/\/series\/([0-9A-Za-z]+)/);
        return seriesIdMatch && seriesIdMatch[1];
    }

    observeLocation(async () => {
        const mdTitleId = getMdTitleId();
        const komgaSeriesId = getKomgaSeriesId();

        if (mdTitleId) {
            for (const sectionData of sections) {
                await addNewSection(sectionData, mdTitleId);
            }
        } else if (komgaSeriesId) {
            await autoMatchKomga(komgaSeriesId);
        }
    });

    async function addNewSection(sectionData, titleId) {
        let infoElement = await waitForElement('.flex.flex-wrap.gap-x-4.gap-y-2').catch(console.warn);
        if (!infoElement) return;
        infoElement = window.getComputedStyle(infoElement).display === 'none' ? await waitForElement(`[id="${titleId}"]`).catch(console.warn) : infoElement;
        if (!infoElement) return;

        await waitForElement('a', infoElement).catch(console.warn);

        const sectionExists = !!document.querySelector(`[local-section-id="${sectionData.id}"]`);
        if (sectionExists) return;

        const infoSectionElement = infoElement.querySelector('.mb-2');
        if (!infoSectionElement) return;

        const altTitlesSectionElement = infoElement.querySelector('.w-full');
        const newInfoSectionElement = infoSectionElement.cloneNode(true);
        const newInfoNameElement = newInfoSectionElement.querySelector('div:first-child');
        const newInfoElement = newInfoSectionElement.querySelector('div:last-child');
        const newInfoLinkElement = newInfoElement.querySelector('a').cloneNode(true);

        newInfoNameElement.textContent = `Local ${sectionData.name}s`;
        newInfoElement.querySelectorAll('a').forEach(element => element.remove());
        newInfoLinkElement.target = '_blank';
        newInfoLinkElement.rel = 'noopener noreferrer';

        newInfoSectionElement.setAttribute('local-section-id', sectionData.id);
        if (altTitlesSectionElement) infoElement.insertBefore(newInfoSectionElement, altTitlesSectionElement);
        else infoElement.appendChild(newInfoSectionElement);

        const newInfoLinkIconElement = newInfoLinkElement.querySelector('svg');
        const newInfoLinkTextElement = newInfoLinkElement.querySelector('span');

        if (newInfoLinkIconElement) newInfoLinkIconElement.remove();

        const createSectionButton = (value) => {
            const newLink = newInfoLinkElement.cloneNode(true);
            const newLinkText = newLink.querySelector('span');
            newLink.href = '#';
            newLink.classList.add('gap-1');
            newLinkText.textContent = value;

            const newLinkRemove = document.createElement('span');
            newLinkRemove.textContent = '⨯';
            newLinkRemove.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();

                if (confirm(`Are you sure you want to remove this ${sectionData.name}?\n\n${value}`)) {
                    try {
                        storeData(titleId, value, sectionData.id, true);
                    } catch (e) {
                        console.error(e);
                        alert(`Unable to remove ${sectionData.name}: ${value}`);
                        return;
                    }
                    newLink.remove();
                }
            });
            newLink.appendChild(newLinkRemove);

            if (sectionData.type === 'url') {
                try {
                    const valueMatch = value.match(/^([\s\w\-]+)\+(https?:\/\/.*)$/)
                    const urlValue = valueMatch && valueMatch[2] ? valueMatch[2] : value
                    if (!validator.isURL(urlValue)) throw new Error('Invalid URL');
                    const url = new URL(urlValue);
                    newLink.href = url.href;
                    newLinkText.textContent = valueMatch && valueMatch[2] ? valueMatch[1] : url.hostname;
                } catch (e) {
                    console.error(e);
                    alert('Invalid URL');
                    return;
                }
            }

            if (sectionData.onclick)
                newLink.addEventListener('click', (event) => {
                    sectionData.onclick(event, value);
                });

            return newLink;
        };

        const storedSectionData = retrieveData(titleId, sectionData.id);
        if (storedSectionData) {
            storedSectionData.forEach(value => {
                const newLink = createSectionButton(value);
                if (!newLink) return;
                newInfoElement.appendChild(newLink);
            });
        }

        newInfoLinkTextElement.textContent = `+ Add ${sectionData.name}`;
        newInfoLinkElement.href = '#';
        newInfoLinkElement.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();

            const value = prompt(`Enter ${sectionData.name}`);
            if (value) {
                const newLink = createSectionButton(value);
                if (!newLink) return;

                try {
                    storeData(titleId, value, sectionData.id);
                } catch (e) {
                    console.error(e);
                    alert(`Unable to store ${sectionData.name}`);
                    return;
                }

                newInfoElement.insertBefore(newLink, newInfoLinkElement);
            }
        });
        newInfoElement.appendChild(newInfoLinkElement);
    }

    async function autoMatchKomga(seriesId) {
        await waitForElement(`.v-image__image[style*="${seriesId}"]`).catch(console.warn);
        await waitForElement('a.v-chip--link').catch(console.warn);

        document.querySelectorAll('a.v-chip--link').forEach(link => {
            const mdTitleId = getMdTitleId(link.href);
            if (mdTitleId) {
                const storedLinks = retrieveData(mdTitleId, 'links');
                if (storedLinks && storedLinks.some(link => seriesId === getKomgaSeriesId(link)))
                    return;
                storeData(mdTitleId, `Komga+${window.location.href.replace(/\?.*$/, '')}`, 'links');
            }
        });
    }

    function retrieveData(resourceId, sectionId) {
        const storedData = GM_getValue(`mangadex_title_data_added`, {});
        return storedData[resourceId] && storedData[resourceId][sectionId];
    }

    function storeData(resourceId, value, sectionId, del = false) {
        const storedData = GM_getValue(`mangadex_title_data_added`, {});
        if (!storedData[resourceId]) storedData[resourceId] = {};
        if (!storedData[resourceId][sectionId]) storedData[resourceId][sectionId] = [];
        if (del) {
            const index = storedData[resourceId][sectionId].indexOf(value);
            if (index > -1) storedData[resourceId][sectionId].splice(index, 1);
        } else {
            storedData[resourceId][sectionId].push(value);
        }
        GM_setValue(`mangadex_title_data_added`, storedData);
    }

    function observeLocation(onChange) {
        let currentLocation = document.location.href;

        const observer = new MutationObserver(() => {
            if (currentLocation !== document.location.href) {
                currentLocation = document.location.href;
                onChange();
            }
        });

        onChange();
        observer.observe(document.body, {
            childList: true,
            subtree: true,
        });
    }

    function waitForElement(querySelectors, rootElement = document.body, timeout = 60000) {
        let element = rootElement.querySelector(querySelectors);
        let currentLocation = document.location.pathname;

        return new Promise((resolve, reject) => {
            if (element) return resolve(element);

            const observer = new MutationObserver(() => {
                element = rootElement.querySelector(querySelectors);

                if (currentLocation !== document.location.pathname) {
                    observer.disconnect();
                    reject(`Location changed while waiting for Element: ${querySelectors}`);
                } else if (element) {
                    observer.disconnect();
                    resolve(element);
                }
            });

            observer.observe(rootElement, {
                childList: true,
                subtree: true,
            });

            setTimeout(() => {
                observer.disconnect();
                reject(`Timeout: Element not found within ${timeout}ms: ${querySelectors}`);
            }, timeout);
        });
    }
})();
