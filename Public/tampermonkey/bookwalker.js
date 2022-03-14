// ==UserScript==
// @name         BookWalker Cover Downloader
// @namespace    https://github.com/RolerGames/UserScripts
// @version      0.6.2
// @description  Select BookWalker covers on the https://bookwalker.jp/series/*/list/* or https://global.bookwalker.jp/series/* page and download them.
// @author       Roler
// @match        https://bookwalker.jp/series/*/list/*
// @match        https://global.bookwalker.jp/series/*
// @icon         https://bookwalker.jp/favicon.ico
// @require      https://cdnjs.cloudflare.com/ajax/libs/jquery/3.6.0/jquery.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/jszip/3.7.1/jszip.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/jszip-utils/0.1.0/jszip-utils.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/FileSaver.js/2.0.5/FileSaver.min.js
// @updateURL    https://raw.githubusercontent.com/RolerGames/UserScripts/master/Public/tampermonkey/bookwalker.js
// @downloadURL  https://raw.githubusercontent.com/RolerGames/UserScripts/master/Public/tampermonkey/bookwalker.js
// @supportURL   https://github.com/RolerGames/UserScripts/issues
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @connect      bookwalker.jp
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    if (window.location.href.search(/https:\/\/bookwalker.jp\/series\/.*\/list\/.*/gi) > -1) {
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

    function bookwalkerCoverDownloader(dataAttribute, titleSection, coverSection, buttonData = {tag: '', class: ''}, css) {
        const concurrentDownloads = {
            max: 4,
            count: 0
        }
        const saveAsNameRegex = /[\\\/:"*?<>|]/gi;
        const coverData = {
            image: $('img.lazy'),
            selected: [],
            clicked: {},
            url: {
                'c.bookwalker.jp': {},
                'blob': {},
                'old': {}
            }
        }
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

        function displayError(message) {
            const errorContainer = $('#bookwalker-cover-downloader-errors');

            errorContainer.removeClass('hidden').append(`<p>Error: ${message}</p>`).animate({
                scrollTop: errorContainer.prop("scrollHeight")
            }, 'fast');
            console.error(message);
        }
        function addCoverData(i, element) {
            const id = `bookwalker-cover-downloader-cover-${i}`;
            coverData.url['c.bookwalker.jp'][id] = `https://c.bookwalker.jp/coverImage_${(parseInt($(element).attr(dataAttribute).split('/')[3].split('').reverse().join('')) - 1)}.jpg`;

            $(element).before(`
                <span class="bookwalker-cover-downloader cover-data cover-size hidden"></span>
                <span class="bookwalker-cover-downloader cover-data cover-fix hidden"><p>${buttonData.other.fixCover.text[0]}</p></span>
                <span class="bookwalker-cover-downloader cover-data cover-link hidden"></span>
                <span class="bookwalker-cover-downloader cover-data download-progress hidden"></span>
            `);
            $(element).parent().children('.cover-fix').children('p').on('click', fixCover);
            $(element).addClass('bookwalker-cover-downloader');
            $(element).attr('id', id);
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

                    if (!coverData.clicked[id] || coverData.clicked[id] === false) {
                        try {
                            getBestQualityCover(element, coverData.url['c.bookwalker.jp'][id]);
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
        function getBestQualityCover(element, url) {
            const id = element.attr('id');
            const title = element.attr('title');
            const retry403 = {
                max: 8,
                count: 0
            }
            coverData.clicked[id] = true;

            displayProgress(element.parent().children('.download-progress'), 0, 'Downloading cover...');
            readyToDownload().then(() => {getAJAX(url)});

            async function readyToDownload() {
                return await new Promise(resolve => {
                    checkDownloads();
                    function checkDownloads() {
                        if (concurrentDownloads.count < concurrentDownloads.max) {
                            ++concurrentDownloads.count;
                            resolve(true);
                        } else {
                            setTimeout(checkDownloads, 400);
                        }
                    }
                });
            }
            function getAJAX(url) {
                GM_xmlhttpRequest({
                    method: 'GET',
                    url: url,
                    responseType: 'blob',
                    onprogress: onprogressAJAX,
                    onload: onloadAJAX,
                    onabort: reportAJAX_Error,
                    onerror: reportAJAX_Error,
                    ontimeout: reportAJAX_Error
                });
            }
            function onprogressAJAX(rspObj) {
                displayProgress(element.parent().children('.download-progress'), rspObj.loaded / rspObj.total * 100, 'Downloading cover...');
            }
            function onloadAJAX(rspObj) {
                if (rspObj.status !== 200 && rspObj.status !== 403 || rspObj.status === 403 && retry403.count >= retry403.max || !rspObj.finalUrl.indexOf(/https:\/\/c.bookwalker.jp\/coverImage_.[0-9]*.jpg/g)) {
                    displayError(`${rspObj.status} ${rspObj.statusText} ${title} ${rspObj.finalUrl}`);
                }
                if (rspObj.status === 403 && retry403.count < retry403.max) {
                    getAJAX(`https://c.bookwalker.jp/coverImage_${(parseInt(rspObj.finalUrl.replace(/^\D+|\D+$/g, '') - 1))}.jpg`);
                    ++retry403.count;
                } else {
                    const coverFixElement = element.parent().children('.cover-fix');

                    concurrentDownloads.count = --concurrentDownloads.count;
                    coverData.url['c.bookwalker.jp'][id] = rspObj.finalUrl;
                    coverData.url['blob'][id] = window.URL.createObjectURL(rspObj.response);
                    displayProgress(element.parent().children('.download-progress'), 100);
                    displayCoverSize(element, rspObj.response);
                    element.parent().children('.cover-link').removeClass('hidden').html(`<a href="${rspObj.finalUrl}">${rspObj.finalUrl.replace(/https:\/\/c.bookwalker.jp\//gi, '')}</a>`);
                    coverFixElement.removeClass('hidden');
                    if (coverFixElement.children('p').text() === buttonData.other.fixCover.text[2]) {
                        coverFixElement.children('p').text(buttonData.other.fixCover.text[1]);
                    } else if (coverFixElement.children('p').text() === buttonData.other.fixCover.text[3]) {
                        coverFixElement.children('p').text(buttonData.other.fixCover.text[0]);
                    }
                }
            }
            function reportAJAX_Error(rspObj) {
                concurrentDownloads.count = --concurrentDownloads.count;
                displayProgress(element.parent().children('.download-progress'), 100);
                displayError(`${rspObj.status} ${rspObj.statusText} ${title} ${rspObj.finalUrl}`);
            }
        }
        function displayCoverSize(element, blob) {
            const coverUrl = coverData.url['blob'][element.attr('id')];
            const fileReader = new FileReader;

            element.attr(dataAttribute, coverUrl).attr('src', coverUrl).attr('srcset', coverUrl);
            fileReader.readAsDataURL(blob);
            fileReader.onload = function () {
                const image = new Image;

                image.src = fileReader.result;
                image.onload = function () {
                    element.parent().children('.cover-size').removeClass('hidden').html(`<p>${image.width}x${image.height}</p>`);
                };
            };
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
                delete coverData.url['blob'][imgElementId];

                if (currentElement.text() === buttonData.other.fixCover.text[0]) {
                    coverData.url['old'][imgElementId] = coverData.url['c.bookwalker.jp'][imgElementId];

                    currentElement.text(buttonData.other.fixCover.text[2]);
                    try {
                        getBestQualityCover(imgElement, `https://c.bookwalker.jp/coverImage_${(parseInt(coverData.url['c.bookwalker.jp'][imgElementId].replace(/^\D+|\D+$/g, '') - 1))}.jpg`);
                    } catch (e) {
                        displayError(e.message);
                    }
                } else if (currentElement.text() === buttonData.other.fixCover.text[1]) {
                    currentElement.text(buttonData.other.fixCover.text[3]);
                    try {
                        getBestQualityCover(imgElement, coverData.url['old'][imgElementId]);
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
        async function coverUrlsCheck(button) {
            busyDownloading = true;
            let checkedUrls = 0;

            coverData.selected.each(promiseUrls);

            return await promiseUrls();

            function promiseUrls(i, element) {
                const id = $(element).attr('id');

                return new Promise(resolve => {
                    checkUrls();

                    function checkUrls() {
                        if (coverData.url['blob'][id]) {
                            ++checkedUrls;
                        } else if (checkedUrls >= coverData.selected.length) {
                            resolve(checkedUrls);
                        } else {
                            setTimeout(checkUrls, 400);
                        }
                        displayProgress(button.children('a').children('.download-progress'), checkedUrls / coverData.selected.length * 100, 'Downloading covers...');
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

            if (coverData.selected.length > 5) {
                if (confirm('You are about to save more than 5 covers ONE BY ONE!')) {
                    execute();
                }
            } else {
                execute();
            }

            function execute() {
                coverData.selected.each(saveCover);

                function saveCover(i, element) {
                    const id = $(element).attr('id');
                    const title = $(element).attr('title');

                    saveAs(coverData.url['blob'][id], title.replace(saveAsNameRegex, '') + '.jpg');
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
                    saveAs(blob, titleSection.replace(saveAsNameRegex, '') + '.zip');
                    busyDownloading = false;
                    displayProgress(button.children('a').children('.download-progress'), 100);
                });

            function zipCover(i, element) {
                const id = $(element).attr('id');
                const title = $(element).attr('title');

                zip.file(title.replace(saveAsNameRegex, '') + '.jpg', coverToPromise(coverData.url['blob'][id], title), {binary:true});
            }
            function coverToPromise(url, title) {
                return new Promise(function(resolve, reject) {
                    JSZipUtils.getBinaryContent(url, function(error, config) {
                        if (error) {
                            displayError(`${error} ${title} ${url}`);

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
