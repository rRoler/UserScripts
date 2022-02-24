// ==UserScript==
// @name         BookWalker Cover Downloader
// @namespace    https://github.com/RolerGames/UserScripts
// @version      0.4
// @description  Select BookWalker covers on the https://bookwalker.jp/series/*/list/* or https://global.bookwalker.jp/series/* page and download them.
// @author       Roler
// @match        https://bookwalker.jp/series/*/list/*
// @match        https://global.bookwalker.jp/series/*
// @icon         https://www.google.com/s2/favicons?domain=bookwalker.jp
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
                margin: 10px;
                display: inline-block;
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
                cursor: pointer; 
                display: inline-block;
            }
        `);
    }

    function bookwalkerCoverDownloader(dataAttribute, titleSection, coverSection, buttonData = {tag: '', class: ''}, css) {
        const saveAsNameRegex = /[\\\/:"*?<>|]/gi;
        const coverData = {
            image: $('img.lazy'),
            selected: [],
            url: {
                'c.bookwalker.jp': {},
                'blob': {}
            }
        }
        let busyDownloading = false;
        buttonData.id = {
            downloadAs: {
                jpeg: 'bookwalker-cover-downloader-download-as-jpeg',
                zip: 'bookwalker-cover-downloader-download-as-zip'
            },
            selectAll: 'bookwalker-cover-downloader-select-all'
        }
        buttonData.text = {
            downloadAs: {
                jpeg: 'Download Selected Covers as JPEG',
                zip: 'Download Selected Covers as ZIP'
            },
            selectAll: {
                true: 'Select All',
                false: 'Deselect All'
            }
        }

        coverSection.before(`
            <div id="bookwalker-cover-downloader-main-div" class="bookwalker-cover-downloader">
                <span id="bookwalker-cover-downloader-buttons" class="bookwalker-cover-downloader"></span>
                <span id="bookwalker-cover-downloader-errors" class="bookwalker-cover-downloader hidden"></span>
            </div>
        `);

        createButton(buttonData.id.downloadAs.jpeg, buttonData.text.downloadAs.jpeg);
        createButton(buttonData.id.downloadAs.zip, buttonData.text.downloadAs.zip);
        createButton(buttonData.id.selectAll, buttonData.text.selectAll.true);

        coverData.image.each(function() {
            const title = $(this).attr('title');
            coverData.url['c.bookwalker.jp'][title] = `https://c.bookwalker.jp/coverImage_${(parseInt($(this).attr(dataAttribute).split('/')[3].split('').reverse().join('')) - 1)}.jpg`;

            $(this).before(`
                <span class="bookwalker-cover-downloader cover-data cover-size hidden"></span>
                <span class="bookwalker-cover-downloader cover-data download-progress hidden"></span>
            `);
            $(this).addClass('bookwalker-cover-downloader');
            $(this).removeClass('cover-selected').parent().removeAttr('href').addClass('bookwalker-cover-downloader');
            $(this).on('click', function () {
                if ($(this).hasClass('cover-selected')) {
                    selectCover($(this), false);
                } else {
                    selectCover($(this));
                }
            });
        });

        function displayError(message) {
            const errorContainer = $('#bookwalker-cover-downloader-errors');

            errorContainer.removeClass('hidden').append(`<p>Error: ${message}</p>`).animate({
                scrollTop: errorContainer.prop("scrollHeight")
            }, 'fast');
            console.error(message);
        }
        function selectCover(element, select) {
            if (busyDownloading === false) {
                if (select === false) {
                    element.removeClass('cover-selected');
                } else {
                    element.addClass('cover-selected');
                    try {
                        getBestQualityCover(element);
                    } catch (e) {
                        displayError(e.message);
                    }
                }
                coverData.selected = $('.bookwalker-cover-downloader.cover-selected');
            }
        }
        function getBestQualityCover(element) {
            const title = element.attr('title');
            const retry403 = {
                max: 8,
                count: {
                    [title]: 0
                }
            }

            if (!coverData.url['blob'][title]) {
                getAJAX(coverData.url['c.bookwalker.jp'][title]);
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
                function onprogressAJAX(rspObj) {
                    displayProgress(element.parent().children('.download-progress'), rspObj.loaded / rspObj.total * 100, 'Downloading cover...');
                }
                function onloadAJAX(rspObj) {
                    if (rspObj.status !== 200 && rspObj.status !== 403 || rspObj.status === 403 && retry403.count[title] >= retry403.max || !rspObj.finalUrl.indexOf(/https:\/\/c.bookwalker.jp\/coverImage_.[0-9]*.jpg/g)) {
                        displayError(`${rspObj.status} ${rspObj.statusText} ${title} ${rspObj.finalUrl}`);
                    }
                    if (rspObj.status === 403 && retry403.count[title] < retry403.max) {
                        getAJAX(`https://c.bookwalker.jp/coverImage_${(parseInt(rspObj.finalUrl.replace(/^\D+|\D+$/g, "") - 1))}.jpg`);
                        retry403.count[title] = retry403.count[title] + 1;
                    } else {
                        coverData.url['blob'][title] = window.URL.createObjectURL(rspObj.response);
                        displayCoverSize(element, rspObj.response);
                    }
                }
                function reportAJAX_Error(rspObj) {
                    displayError(`${rspObj.status} ${rspObj.statusText} ${title} ${rspObj.finalUrl}`);
                }
            }
        }
        function displayCoverSize(element, blob) {
            const coverUrl = coverData.url['blob'][element.attr('title')];
            const fileReader = new FileReader;
            const image = new Image;

            element.attr(dataAttribute, coverUrl).attr('src', coverUrl).attr('srcset', coverUrl);
            fileReader.readAsDataURL(blob);
            fileReader.onload = function() {
                image.src = fileReader.result;
                image.onload = function() {
                    element.parent().children('.cover-size').removeClass('hidden').html(`<p>${image.width}x${image.height}</p>`);
                };
            };
        }
        function displayProgress(element, percent, status) {
            element.parent('a').children('.button-text').addClass('hidden');
            element.removeClass('hidden').html(`
                <p>${status}</p>
                <progress class="bookwalker-cover-downloader" max="100" value="${percent}"></progress>
                <p>${Math.round(percent * 100) / 100}%</p>
            `);
            if (percent >= 100) {
                element.parent('a').children('.button-text').removeClass('hidden');
                element.addClass('hidden').html('');
            }
        }
        function createButton(id, text) {
            $('#bookwalker-cover-downloader-buttons').append(`
                <${buttonData.tag} id="${id}" class="${buttonData.class} bookwalker-cover-downloader">
                    <a class="bookwalker-cover-downloader">
                        <span class="bookwalker-cover-downloader button-text">${text}</span>
                        <span class="bookwalker-cover-downloader download-progress hidden"></span>
                    </a>
                </${buttonData.tag}>
            `);

            const currentButton = $(`#${id}`);

            currentButton.on('click', function() {
                if (busyDownloading === false) {
                    if (id === buttonData.id.selectAll) {
                        selectAllCovers();
                    } else if (coverData.selected.length > 0) {
                        busyDownloading = true;
                        try {
                            coverUrlsCheck();
                        } catch (e) {
                            busyDownloading = false;
                            displayError(e.message);
                        }
                    }
                }
            });

            function coverUrlsCheck() {
                if (busyDownloading === true) {
                    let checkedUrls = 0;

                    coverData.selected.each(async function() {
                        const title = $(this).attr('title');
                        const checkedUrl = await promiseUrl(title);
                        checkedUrls = checkedUrls + checkedUrl;

                        if (checkedUrls >= coverData.selected.length) {
                            downloadCovers()
                        }
                    });

                    function downloadCovers() {
                        try {
                            if (id === buttonData.id.downloadAs.jpeg) {
                                downloadCoversAsJPEG();
                            } else if (id === buttonData.id.downloadAs.zip) {
                                downloadCoversAsZIP();
                            }
                        } catch (e) {
                            busyDownloading = false;
                            displayError(e.message);
                        }
                    }
                    function promiseUrl(title) {
                        return new Promise(resolve => {
                            checkUrl()

                            function checkUrl() {
                                if (coverData.url['blob'][title]) {
                                    resolve(1);
                                } else {
                                    setTimeout(checkUrl, 300);
                                }
                            }
                        });
                    }
                }
            }
            function downloadCoversAsJPEG() {
                coverData.selected.each(function() {
                    const title = $(this).attr('title');

                    saveAs(coverData.url['blob'][title], title.replace(saveAsNameRegex, '') + '.jpg');
                });

                busyDownloading = false;
            }
            function downloadCoversAsZIP() {
                const zip = new JSZip();

                coverData.selected.each(function() {
                    const title = $(this).attr('title');

                    zip.file(title.replace(saveAsNameRegex, '') + '.jpg', coverToPromise(coverData.url['blob'][title], title), {binary:true});
                });
                zip.generateAsync({type:'blob', streamFiles: true}, function updateCallback(metaconfig) {
                    displayProgress($(currentButton.children('a').children('.download-progress')), metaconfig.percent, 'Zipping covers...');
                })
                    .then(function callback(blob) {
                        saveAs(blob, titleSection.replace(saveAsNameRegex, '') + '.zip');

                        busyDownloading = false;
                    });

                function coverToPromise(url, title) {
                    return new Promise(function(resolve, reject) {
                        JSZipUtils.getBinaryContent(url, function (error, config) {
                            if (error) {
                                reject(error);

                                displayError(`${error} ${title} ${url}`);
                            } else {
                                resolve(config);
                            }
                        });
                    });
                }
            }
            function selectAllCovers() {
                const buttonTextElement = currentButton.children('a').children('.button-text');

                if (buttonTextElement.text() === buttonData.text.selectAll.false) {
                    coverData.selected.each(function() {
                        selectCover($(this), false);
                    });
                    buttonTextElement.text(buttonData.text.selectAll.true);
                } else if (buttonTextElement.text() === buttonData.text.selectAll.true) {
                    coverData.image.each(function() {
                        selectCover($(this));
                    });
                    buttonTextElement.text(buttonData.text.selectAll.false);
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
            }
            .bookwalker-cover-downloader.cover-data.cover-size {
                top: 0;
                left: 0;
                width: fit-content;
            }
            .bookwalker-cover-downloader.cover-data.download-progress {
                bottom: 0;
                left: 0;
                width: 100%;
                text-align: center;
            }
        `);
    }
})();
