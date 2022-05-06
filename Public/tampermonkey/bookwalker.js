// ==UserScript==
// @name         BookWalker Cover Downloader
// @namespace    https://github.com/RolerGames/UserScripts
// @version      0.9-dev
// @description  Select covers on the https://bookwalker.jp/series/*/list/* or https://global.bookwalker.jp/series/* page and download them.
// @author       Roler
// @match        https://bookwalker.jp/*
// @match        https://global.bookwalker.jp/*
// @icon         https://bookwalker.jp/favicon.ico
// @require      https://cdnjs.cloudflare.com/ajax/libs/jquery/3.6.0/jquery.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/jszip/3.7.1/jszip.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/jszip-utils/0.1.0/jszip-utils.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/FileSaver.js/2.0.5/FileSaver.min.js
// @require      https://openuserjs.org/src/libs/sizzle/GM_config.js
// @updateURL    https://raw.githubusercontent.com/RolerGames/UserScripts/master/Public/tampermonkey/bookwalker.js
// @downloadURL  https://raw.githubusercontent.com/RolerGames/UserScripts/master/Public/tampermonkey/bookwalker.js
// @supportURL   https://github.com/RolerGames/UserScripts/issues
// @grant        GM_xmlhttpRequest
// @grant        GM_download
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @connect      bookwalker.jp
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    let needsReload = false;
    const bookwalkerConfig = {
        'id': 'bookwalker-cover-downloader-config',
        'title': 'BookWalker Cover Downloader',
        'fields': {
            'downloadSource': {
                'label': 'Download source:',
                'section': ['Download Settings', '<hr>'],
                'type': 'select',
                'options': ['Automatic', 'c.bookwalker.jp', 'viewer-epubs-trial.bookwalker.jp'],
                'default': 'Automatic'
            },
            'downloadOnLoad': {
                'label': 'Automatic download',
                'type': 'checkbox',
                'title': 'Download all covers automatically when you open the page.',
                'default': false
            },
            'maxConcurrentDownloads': {
                'label': 'Maximum concurrent downloads:',
                'type': 'int',
                'title': 'Maximum number of covers to download at the same time. min=1, max=64.',
                'min': 1,
                'max': 64,
                'default': 64
            },
            'max403Retries': {
                'label': 'Maximum download retries:',
                'type': 'int',
                'title': 'Maximum number of times to change the cover URL and try to download the cover if the expected URL is wrong. min=0, max=16.',
                'min': 0,
                'max': 16,
                'default': 4
            },
            'saveAsJPEGSeriesFolder': {
                'label': 'Save JPEGs inside a series folder.',
                'type': 'checkbox',
                'title': 'Save JPEGs inside a folder (inside the JPEG save location) named as the series title (Chromium browsers might not support this).',
                'default': false
            },
            'SaveAsJPEGLocationCheckbox': {
                'label': 'JPEG save location',
                'type': 'checkbox',
                'title': 'Enable/Disable the JPEG save location (Chromium browsers might not support it).',
                'default': false
            },
            'saveAsJPEGLocation': {
                'label': 'JPEG save location:',
                'type': 'text',
                'title': 'Folder (inside the default download folder) in which the covers will be saved as JPEG.',
                'size': 128,
                'default': 'Cover Art/BookWalker/JPEG/'
            },
            'replaceCover': {
                'label': 'Replace cover',
                'section': ['UI Settings', '<hr>'],
                'type': 'checkbox',
                'title': 'Replace the existing cover with the new one.',
                'default': true
            },
            'showTryToFix': {
                'label': 'Show Try to Fix',
                'type': 'checkbox',
                'title': 'Show the Try to Fix button.',
                'default': true
            },
            'showCoverSize': {
                'label': 'Show cover size',
                'type': 'checkbox',
                'title': 'Show the size of the new cover.',
                'default': true
            },
            'showCoverURL': {
                'label': 'Show cover URL',
                'type': 'checkbox',
                'title': 'Show the URL of the new cover.',
                'default': true
            },
            'redirectSeriesPages': {
                'label': 'Redirect the series page to list',
                'section': ['BookWalker Japan Settings', 'https://bookwalker.jp/'],
                'type': 'checkbox',
                'title': 'Redirect the /series/ page to the /series/*/list/ page.',
                'default': false
            }
        },
        'events': {
            'save': function() {needsReload = true},
            'close': reloadPage
        }
    }
    GM_config.init(bookwalkerConfig);
    GM_registerMenuCommand('Settings', function() {GM_config.open()});

    if (window.location.href.search(/https:\/\/bookwalker.jp\/series\/.*/gi) > -1) {
        if (window.location.href.search(/https:\/\/.*\/series\/.*\/list\/.*/gi) <= -1) {
            if (GM_config.get('redirectSeriesPages') === true && $(`a[href="${window.location.href}list/"]`).length > 0) {
                window.location.replace(`${window.location.href}list/`);
            }
        } else {
            bookwalkerCoverDownloader(
                'data-original',
                $('.o-contents-section__title').text(),
                $('.o-contents-section__body').first(), {
                    tag: 'button',
                    class: 'a-basic-btn--secondary'
                }, `
                button.bookwalker-cover-downloader.a-basic-btn--secondary {
                    margin: 2px;
                    display: inline-block;
                    max-width: 256px;
                }
            `);
        }
    } else if (window.location.href.search(/https:\/\/global.bookwalker.jp\/series\/.*/gi) > -1) {
        bookwalkerCoverDownloader(
            'data-srcset',
            $('.title-main-inner').text().split('\n                            ')[1],
            $('.o-tile-list').first(), {
                tag: 'p',
                class: 'btn-cart-add btn-box m-b40'
            }, `
            p.bookwalker-cover-downloader.btn-cart-add.btn-box.m-b40 {
                margin: 2px;
                cursor: pointer; 
                display: inline-block;
                max-width: 256px;
            }
        `);
    }

    function reloadPage() {
        if (needsReload === true) {
            location.reload();
        }
    }
    function bookwalkerCoverDownloader(dataAttribute, titleSection, coverSection, buttonData = {tag: '', class: ''}, css) {
        const config = {};
        getConfig();
        const concurrentDownloads = {
            max: config.maxConcurrentDownloads,
            count: 0
        }
        const saveAsNameRegex = /[\\\/:"*?<>|]/gi;
        const coverData = {
            image: $('img.lazy'),
            source: bookwalkerConfig.fields.downloadSource.options,
            knownTitle: {},
            cover: {},
            extension: '.jpg',
            selected: [],
        }
        const checkTimeout = 200;
        let busyDownloading = false;
        buttonData.button = {
            downloadAsJpeg: {
                id: 'bookwalker-cover-downloader-download-as-jpeg',
                text: ['Save Selected Covers as JPEG'],
                execute(button) {saveCovers(saveCoversAsJPEG, button)}
            },
            downloadAsZip: {
                id: 'bookwalker-cover-downloader-download-as-zip',
                text: ['Save Selected Covers as ZIP'],
                execute(button) {saveCovers(saveCoversAsZIP, button)}
            },
            selectAll: {
                id: 'bookwalker-cover-downloader-select-all',
                text: ['Select All', 'Deselect All'],
                execute(button) {selectAllCovers(button)}
            }
        }
        buttonData.other = {
            fixCover: {
                text: ['Try to Fix', 'Revert', 'Fixing...', 'Reverting...']
            }
        }

        coverSection.before(`
            <div id="bookwalker-cover-downloader-main-div" class="bookwalker-cover-downloader">
                <div id="bookwalker-cover-downloader-buttons" class="bookwalker-cover-downloader"></div>
                <div id="bookwalker-cover-downloader-errors" class="bookwalker-cover-downloader hidden"></div>
            </div>
        `);

        $.each(buttonData.button, createButton);

        coverData.image.each(addCoverData);

        $('.bookwalker-cover-downloader.download-progress').append(`
            <p class="bookwalker-cover-downloader download-progress progress-status"></p>
            <progress class="bookwalker-cover-downloader download-progress progress-bar" max="100" value="0"></progress>
            <p class="bookwalker-cover-downloader download-progress progress-percent"></p>
        `);

        coverData.image.each(getCoverUrls);

        if (config.downloadOnLoad === true) {
            coverData.image.each((i, element) => selectCover($(element)));
            coverData.image.each((i, element) => selectCover($(element), false));
        }

        function getConfig() {
            for (let i in bookwalkerConfig.fields) {
                config[i] = GM_config.get(i);
            }
        }
        function displayError(message) {
            const container = $('#bookwalker-cover-downloader-errors');

            container.removeClass('hidden').append(`<p>Error: ${message}</p>`).animate({
                scrollTop: container.prop("scrollHeight")
            }, 'fast');
            console.error(message);
        }
        function addCoverData(i, element) {
            const id = !$(element).parent().attr('data-uuid') ? $(element).parent().parent().children('a').attr('href').split(':WISH:')[1]:$(element).parent().attr('data-uuid');
            coverData.cover[id] = {
                blob: {},
                [coverData.source[1]]: {},
                [coverData.source[2]]: {},
                clicked: false
            }

            $(element).attr('id', id);
            $(element).before(`
                <span class="bookwalker-cover-downloader cover-data cover-size hidden"></span>
                <span class="bookwalker-cover-downloader cover-data cover-fix hidden"><p>${buttonData.other.fixCover.text[0]}</p></span>
                <span class="bookwalker-cover-downloader cover-data cover-link hidden"></span>
                <span class="bookwalker-cover-downloader cover-data download-progress hidden"></span>
            `);
            $(element).parent().children('.cover-fix').children('p').on('click', fixCover);
            $(element).addClass('bookwalker-cover-downloader');
            $(element).removeClass('cover-selected').parent().removeAttr('href').addClass('bookwalker-cover-downloader');
            $(element).on('mousedown', cover => coverClick($(cover.currentTarget)));
        }
        function coverClick(element) {
            if (element.hasClass('cover-selected')) {
                selectCover(element, false);
            } else {
                selectCover(element);
            }
        }
        function selectCover(element, select = true) {
            if (busyDownloading === false) {
                if (select === true) {
                    const id = element.attr('id');

                    element.addClass('cover-selected');

                    if (!coverData.cover[id].clicked || coverData.cover[id].clicked === false) {
                        const title = element.attr('title').replace(saveAsNameRegex, '');

                        if (coverData.knownTitle[title] > -1) {
                            coverData.cover[id].title = `${title}(${++coverData.knownTitle[title]})`;
                        } else {
                            coverData.knownTitle[title] = 0;
                            coverData.cover[id].title = title;
                        }

                        try {
                            getBestQualityCover(element);
                        } catch (e) {
                            displayError(e.message);
                        }
                    }
                } else if (select === false) {
                    element.removeClass('cover-selected');
                }
                coverData.selected = $('.bookwalker-cover-downloader.cover-selected');
            }
        }
        async function readyToDownload() {
            return await new Promise(resolve => {
                check();

                function check() {
                    if (concurrentDownloads.count < concurrentDownloads.max) {
                        ++concurrentDownloads.count;
                        resolve(true);
                    } else {
                        setTimeout(check, checkTimeout);
                    }
                }
            });
        }
        function AJAXRequest(url, type, fn, element, status) {
            displayProgress(element.parent().children('.download-progress'), 0, status);
            readyToDownload().then(get);

            function get() {
                GM_xmlhttpRequest({
                    method: 'GET',
                    url: url,
                    responseType: type,
                    onprogress: onProgress,
                    onload: onLoad,
                    onabort: reportError,
                    onerror: reportError,
                    ontimeout: reportError
                });
            }
            function onProgress(rspObj) {
                displayProgress(element.parent().children('.download-progress'), rspObj.loaded / rspObj.total * 100, status);
            }
            function onLoad(rspObj) {
                --concurrentDownloads.count;
                fn(rspObj);
            }
            function reportError(rspObj) {
                --concurrentDownloads.count;
                displayProgress(element.parent().children('.download-progress'), 100);
                displayError(`${rspObj.status} ${rspObj.statusText} ${coverData.cover[id].title} ${rspObj.finalUrl}`);
            }
        }
        function getCoverUrls(i, element) {
            const id = $(element).attr('id');
            const getUrl = {
                get: (url, fn) => AJAXRequest(url, 'json', fn, $(element), 'Getting cover URL...')
            }

            getUrl[coverData.source[1]] = function() {
                coverData.cover[id][coverData.source[1]].url = `https://c.bookwalker.jp/coverImage_${(parseInt($(element).attr(dataAttribute).split('/')[3].split('').reverse().join('')) - 1)}${coverData.extension}`;
                coverData.cover[id][coverData.source[1]].urlStatus = true;
            }
            getUrl[coverData.source[2]] = function() {
                coverData.cover[id][coverData.source[2]].urlStatus = true;

                getUrl.get(`https://viewer-trial.bookwalker.jp/trial-page/c?cid=${id}&BID=0`, getAuthInfo);

                function getAuthInfo(rspObj) {
                    try {
                        if (rspObj.status !== 200) {
                            displayError(`${rspObj.status} ${rspObj.statusText} ${coverData.cover[id].title} ${rspObj.finalUrl}`);
                        }

                        const rspObjData = rspObj.response
                        const rspUrl = rspObjData.url;
                        const cty = rspObjData.cty;
                        const rspPfCd = rspObjData.auth_info['pfCd'];
                        const rspPolicy = rspObjData.auth_info['Policy'];
                        const rspSignature = rspObjData.auth_info['Signature'];
                        const rspKeyPairId = rspObjData.auth_info['Key-Pair-Id'];
                        const configPath = cty === 0 ? 'normal_default/configuration_pack.json':'configuration_pack.json';

                        getUrl.get(`${rspUrl}${configPath}?pfCd=${rspPfCd}&Policy=${rspPolicy}&Signature=${rspSignature}&Key-Pair-Id=${rspKeyPairId}`, getMetadata);

                        function getMetadata(rspObj) {
                            if (rspObj.status !== 200) {
                                displayError(`${rspObj.status} ${rspObj.statusText} ${coverData.cover[id].title} ${rspObj.finalUrl}`);
                            }

                            const rspContents = rspObj.response.configuration.contents[0];
                            const rspInfoSize = rspObj.response[rspContents.file].FileLinkInfo.PageLinkInfoList[0].Page.Size;
                            const filePath = rspContents.file.replace(/\.\.\//, '');
                            coverData.cover[id][coverData.source[2]].filePath = filePath;
                            coverData.cover[id][coverData.source[2]].width = rspInfoSize.Width;
                            coverData.cover[id][coverData.source[2]].height = rspInfoSize.Height;

                            coverData.cover[id][coverData.source[2]].url = `${rspUrl}${filePath}/0.${rspContents.type}?Policy=${rspPolicy}&Signature=${rspSignature}&Key-Pair-Id=${rspKeyPairId}`;

                            console.log(`${coverData.cover[id][coverData.source[2]].width}x${coverData.cover[id][coverData.source[2]].height}`);
                            console.log(coverData.cover[id][coverData.source[2]].url);
                        }
                    } catch (e) {
                        coverData.cover[id][coverData.source[2]].urlStatus = false;
                        displayProgress($(element).parent().children('.download-progress'), 100);
                    }
                }
            }

            if (config.downloadSource === coverData.source[0]) {
                getUrl[coverData.source[1]]();
                getUrl[coverData.source[2]]();
            } else if (config.downloadSource === coverData.source[1]) {
                getUrl[coverData.source[1]]();
            } else if (config.downloadSource === coverData.source[2]) {
                getUrl[coverData.source[2]]();
            }
        }
        function getBestQualityCover(element) {
            const id = element.attr('id');
            const retry403 = {
                max: config.max403Retries,
                count: 0
            }
            const getCover = {
                get: (url, fn) => AJAXRequest(url, 'blob', fn, element, 'Downloading cover...')
            }
            coverData.cover[id].clicked = true;

            getCover[coverData.source[1]] = function(rspObj) {
                if (rspObj.status !== 200 && rspObj.status !== 403 || rspObj.status === 403 && retry403.count >= retry403.max || !rspObj.finalUrl.indexOf(/https:\/\/c.bookwalker.jp\/coverImage_.[0-9]*.jpg/g)) {
                    displayError(`${rspObj.status} ${rspObj.statusText} ${coverData.cover[id].title} ${rspObj.finalUrl}`);
                }

                if (rspObj.status === 403 && retry403.count < retry403.max) {
                    getCover.get(`https://c.bookwalker.jp/coverImage_${(parseInt(rspObj.finalUrl.replace(/^\D+|\D+$/g, '') - 1))}${coverData.extension}`, getCover[coverData.source[1]]);
                    ++retry403.count;
                } else {
                    const blobUrl = window.URL.createObjectURL(rspObj.response);
                    const image = new Image;
                    image.src = blobUrl;
                    image.onload = function () {
                        coverData.cover[id][coverData.source[1]].url = rspObj.finalUrl;
                        coverData.cover[id][coverData.source[1]].width = image.width;
                        coverData.cover[id][coverData.source[1]].height = image.height;
                        coverData.cover[id][coverData.source[1]].blobUrl = blobUrl;
                    };
                }
            }
            getCover[coverData.source[2]] = function(rspObj) {
                if (rspObj.status !== 200) {
                    displayError(`${rspObj.status} ${rspObj.statusText} ${coverData.cover[id].title} ${rspObj.finalUrl}`);
                }

                coverData.cover[id][coverData.source[2]].url = rspObj.finalUrl;
                coverData.cover[id][coverData.source[2]].blobUrl = window.URL.createObjectURL(rspObj.response);
            }

            if (config.downloadSource === coverData.source[0]) {
                download(coverData.source[1], function(source, url) {
                    const source1 = source;

                    displayProgress(element.parent().children('.download-progress'), 0, 'Downloading cover...');

                    if (url === false) {
                        setCover(coverData.source[2]);
                    } else {
                        download(coverData.source[2], function(source, url) {
                            const source2 = source;

                            if (url === false) {
                                setCover(source1);
                            } else {
                                if (coverData.cover[id][source1].width * coverData.cover[id][source1].height >= coverData.cover[id][source2].width * coverData.cover[id][source2].height) {
                                    if (coverData.cover[id][coverData.source[1]].width === 964 && coverData.cover[id][coverData.source[1]].height === 1200) {
                                        setCover(source2);
                                    } else {
                                        setCover(source1);
                                    }
                                } else if (coverData.cover[id][source1].width * coverData.cover[id][source1].height < coverData.cover[id][source2].width * coverData.cover[id][source2].height) {
                                    setCover(source2);
                                }
                            }
                        });
                    }
                });
            } else if (config.downloadSource === coverData.source[1]) {
                download(coverData.source[1]);
            } else if (config.downloadSource === coverData.source[2]) {
                download(coverData.source[2]);
            }

            function download(source, fn = setCover) {
                promiseUrl(source, 'url').then((url) => {
                    if (url === false) {
                        fn(source, url);
                    } else {
                        getCover.get(url, getCover[source]);
                        promiseUrl(source, 'blobUrl').then(() => fn(source, url));
                    }
                });
            }
            function setCover(source, url) {
                if (url === false) {
                    coverData.cover[id].blob.url = 'https://c.bookwalker.jp/coverImage_5051842.jpg';
                    displayError(`Failed to get cover from ${source}`);
                } else {
                    coverData.cover[id].blob.url = coverData.cover[id][source].blobUrl;
                    coverData.cover[id].blob.coverUrl = coverData.cover[id][source].url;
                    coverData.cover[id].blob.width = coverData.cover[id][source].width;
                    coverData.cover[id].blob.height = coverData.cover[id][source].height;
                    displayCover(element, id);
                }
                displayProgress(element.parent().children('.download-progress'), 100);
            }
            async function promiseUrl(source, url) {
                return await new Promise((resolve) => {
                    check();

                    function check() {
                        if (coverData.cover[id][source].urlStatus === true) {
                            if (coverData.cover[id][source][url]) {
                                resolve(coverData.cover[id][source][url]);
                            } else {
                                setTimeout(check, checkTimeout);
                            }
                        } else {
                            resolve(false);
                        }
                    }
                });
            }
        }
        function displayCover(element, id) {
            const fixElement = element.parent().children('.cover-fix');

            if (config.replaceCover === true) {
                element.attr(dataAttribute, coverData.cover[id].blob.url).attr('src', coverData.cover[id].blob.url).attr('srcset', coverData.cover[id].blob.url);
            }
            if (config.showTryToFix === true && coverData.cover[id][coverData.source[1]].url === coverData.cover[id].blob.coverUrl || config.showTryToFix === true && fixElement.children('p').text() === buttonData.other.fixCover.text[1] || config.showTryToFix === true && fixElement.children('p').text() === buttonData.other.fixCover.text[2] || config.showTryToFix === true && fixElement.children('p').text() === buttonData.other.fixCover.text[3]) {
                fixElement.removeClass('hidden');
                if (fixElement.children('p').text() === buttonData.other.fixCover.text[2]) {
                    fixElement.children('p').text(buttonData.other.fixCover.text[1]);
                } else if (fixElement.children('p').text() === buttonData.other.fixCover.text[3]) {
                    fixElement.children('p').text(buttonData.other.fixCover.text[0]);
                }
            }
            if (config.showCoverSize === true) {
                element.parent().children('.cover-size').removeClass('hidden').html(`<p>${coverData.cover[id].blob.width}x${coverData.cover[id].blob.height}</p>`);
            }
            if (config.showCoverURL === true) {
                const text = coverData.cover[id][coverData.source[1]].url === coverData.cover[id].blob.coverUrl ? coverData.cover[id][coverData.source[1]].url:coverData.cover[id][coverData.source[2]].filePath

                element.parent().children('.cover-link').removeClass('hidden').html(`<a href="${coverData.cover[id].blob.coverUrl}">${text.replace(/(.*?)(?=[^\/]*$)/i, '')}</a>`);
            }
        }
        function displayProgress(element, percent, status) {
            if (percent >= 0 && percent < 100) {
                element.parent('a').children('.button-text').addClass('hidden');
                element.removeClass('hidden');
                element.children('.progress-status').text(`${status}`);
                element.children('.progress-bar').val(percent);
                element.children('.progress-percent').text(`${Math.round(percent * 100) / 100}%`);
            } else if (percent >= 100) {
                element.parent('a').children('.button-text').removeClass('hidden');
                element.addClass('hidden');
            }
        }
        function fixCover(element) {
            if (busyDownloading === false) {
                const currentElement = $(element.currentTarget);
                const imgElement = currentElement.parent().parent().children('img');
                const imgElementId = imgElement.attr('id');
                window.URL.revokeObjectURL(coverData.cover[imgElementId].blob.url);
                window.URL.revokeObjectURL(coverData.cover[imgElementId][coverData.source[1]].blobUrl);
                delete coverData.cover[imgElementId].blob.url;
                delete coverData.cover[imgElementId][coverData.source[1]].blobUrl;

                if (currentElement.text() === buttonData.other.fixCover.text[0]) {
                    coverData.cover[imgElementId][coverData.source[1]].oldUrl = coverData.cover[imgElementId][coverData.source[1]].url;
                    coverData.cover[imgElementId][coverData.source[1]].url = `https://c.bookwalker.jp/coverImage_${(parseInt(coverData.cover[imgElementId][coverData.source[1]].url.replace(/^\D+|\D+$/g, '') - 1))}${coverData.extension}`;

                    currentElement.text(buttonData.other.fixCover.text[2]);
                    try {
                        getBestQualityCover(imgElement);
                    } catch (e) {
                        displayError(e.message);
                    }
                } else if (currentElement.text() === buttonData.other.fixCover.text[1]) {
                    coverData.cover[imgElementId][coverData.source[1]].url = coverData.cover[imgElementId][coverData.source[1]].oldUrl;

                    currentElement.text(buttonData.other.fixCover.text[3]);
                    try {
                        getBestQualityCover(imgElement);
                    } catch (e) {
                        displayError(e.message);
                    }
                }
            }
        }
        function createButton(i, button) {
            $('#bookwalker-cover-downloader-buttons').append(`
                <${buttonData.tag} id="${button.id}" class="${buttonData.class} bookwalker-cover-downloader">
                    <a class="bookwalker-cover-downloader">
                        <span class="bookwalker-cover-downloader button-text">${button.text[0]}</span>
                        <span class="bookwalker-cover-downloader download-progress hidden"></span>
                    </a>
                </${buttonData.tag}>
            `);

            $(`#${button.id}`).on('click', element => button.execute($(element.currentTarget)));
        }
        async function coverUrlsCheck(element) {
            busyDownloading = true;
            let checked = 0;

            coverData.selected.each(promiseUrls);

            return await promiseUrls();

            function promiseUrls(i, selectedElement) {
                const id = $(selectedElement).attr('id');

                return new Promise(resolve => {
                    check();

                    function check() {
                        if (coverData.cover[id] && coverData.cover[id].blob.url) {
                            ++checked;
                        } else if (checked >= coverData.selected.length) {
                            resolve(checked);
                        } else {
                            setTimeout(check, checkTimeout);
                        }
                        displayProgress(element.children('a').children('.download-progress'), checked / coverData.selected.length * 100, 'Downloading covers...');
                    }
                });
            }
        }
        function saveCovers(fn, button) {
            if (coverData.selected.length > 0 && busyDownloading === false) {
                try {
                    coverUrlsCheck(button).then(() => {
                        try {
                            fn(button);
                        } catch (e) {
                            busyDownloading = false;
                            displayError(e.message);
                        }
                    });
                } catch (e) {
                    busyDownloading = false;
                    displayProgress(button.children('a').children('.download-progress'), 100);
                    displayError(e.message);
                }
            }
        }
        function saveCoversAsJPEG() {
            busyDownloading = false;

            coverData.selected.each(save);

            function save(i, element) {
                const id = $(element).attr('id');
                const url = coverData.cover[id].blob.url;
                const title = coverData.cover[id].title;
                const seriesFolder = config.saveAsJPEGSeriesFolder ? titleSection.replace(saveAsNameRegex, '') + '/':'';
                const path = config.SaveAsJPEGLocationCheckbox ? config.saveAsJPEGLocation:'';

                displayProgress($(element).parent().children('.download-progress'), 0, 'Saving Cover...');
                readyToDownload().then(download);

                function download() {
                    GM_download({
                        url: url,
                        name: path + seriesFolder + title + coverData.extension,
                        saveAs: false,
                        onload: onLoad,
                        onabort: reportError,
                        onerror: reportError,
                        ontimeout: reportError
                    });

                    function onLoad() {
                        --concurrentDownloads.count;
                        displayProgress($(element).parent().children('.download-progress'), 100);
                    }
                    function reportError(rspObj) {
                        --concurrentDownloads.count;
                        displayError(`${rspObj.status} ${rspObj.statusText} ${title} ${url}`);
                    }
                }
            }
        }
        function saveCoversAsZIP(button) {
            busyDownloading = true;
            const zip = new JSZip();

            coverData.selected.each(zipCover);

            zip.generateAsync({type:'blob', streamFiles: true}, function updateCallback(metaconfig) {
                displayProgress(button.children('a').children('.download-progress'), metaconfig.percent, 'Zipping covers...');
            })
                .then(function callback(blob) {
                    const blobName = titleSection.replace(saveAsNameRegex, '');

                    saveAs(blob, blobName + '.zip');

                    busyDownloading = false;
                    displayProgress(button.children('a').children('.download-progress'), 100);
                });

            function zipCover(i, element) {
                const id = $(element).attr('id');

                zip.file(coverData.cover[id].title + coverData.extension, coverToPromise(id), {binary:true});
            }
            function coverToPromise(id) {
                return new Promise(function(resolve, reject) {
                    JSZipUtils.getBinaryContent(coverData.cover[id].blob.url, function(error, config) {
                        if (error) {
                            busyDownloading = false;
                            coverData.cover[id].clicked = false;

                            displayError(`${error} ${coverData.cover[id].title} ${coverData.cover[id].blob.coverUrl}`);

                            reject(error);
                        } else {
                            resolve(config);
                        }
                    });
                });
            }
        }
        function selectAllCovers(button) {
            if (busyDownloading === false) {
                const buttonTextElement = button.children('a').children('.button-text');

                if (buttonTextElement.text() === buttonData.button.selectAll.text[1]) {
                    coverData.image.each(function (i, element) {
                        selectCover($(element), false);
                    });
                    buttonTextElement.text(buttonData.button.selectAll.text[0]);
                } else if (buttonTextElement.text() === buttonData.button.selectAll.text[0]) {
                    coverData.image.each(function (i, element) {
                        selectCover($(element));
                    });
                    buttonTextElement.text(buttonData.button.selectAll.text[1]);
                }
            }
        }

        setInterval(function() {console.log(concurrentDownloads.count)}, checkTimeout)

        GM_addStyle (css + `
            .bookwalker-cover-downloader.hidden {
                display: none;
            }
            .bookwalker-cover-downloader#bookwalker-cover-downloader-main-div {
                width: 100%;
                text-align: center;
            }
            .bookwalker-cover-downloader#bookwalker-cover-downloader-errors {
                color: red;
                max-height: 60px;
                overflow-y: scroll;
                margin: 10px;
            }
            img.lazy.bookwalker-cover-downloader {
                opacity: 0.5;
            }
            img.lazy.bookwalker-cover-downloader.cover-selected {
                opacity: 1;
            }
            a.bookwalker-cover-downloader {
                text-decoration: none;
                cursor: pointer;
            }
            .bookwalker-cover-downloader.cover-data {
                color: white;
                background-color: rgba(0, 0, 0, 0.50);
                font-size: 14px;
                position: absolute;
                z-index: 1000;
                overflow: hidden;
                white-space: nowrap;
                border-radius: 4px;
            }
            .bookwalker-cover-downloader.cover-data a {
                color: white;
            }
            .bookwalker-cover-downloader.cover-data.cover-size {
                width: fit-content;
                top: -16px;
                left: 0;
            }
            .bookwalker-cover-downloader.cover-data.cover-fix {
                width: fit-content;
                top: -16px;
                right: 0;
            }
            .bookwalker-cover-downloader.cover-data.cover-link {
                width: 100%;
                text-align: center;
                bottom: -16px;
                left: 0;
            }
            .bookwalker-cover-downloader.cover-data.download-progress {
                width: 100%;
                text-align: center;
                bottom: 0;
                left: 0;
            }
        `);
    }
})();
