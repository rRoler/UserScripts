// ==UserScript==
// @name         BookWalker Cover Downloader
// @namespace    https://github.com/RolerGames/UserScripts
// @version      0.3
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
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @connect      c.bookwalker.jp
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    if (window.location.href.search(/https:\/\/bookwalker.jp\/series\/.*\/list\/.*/gi) > -1) {
        bookwalkerCoverDownloader(
            'data-original',
            $('.o-contents-section__title').text(),
            $('.o-contents-section__body').first(), `
            <button id="cover-download-as-jpeg" class="a-basic-btn--secondary bookwalker-downloader cover-download-button"></button>
            <button id="cover-download-as-zip" class="a-basic-btn--secondary bookwalker-downloader cover-download-button"></button>
            <button id="cover-select-all" class="a-basic-btn--secondary bookwalker-downloader cover-download-button"></button>
            `, `
            button.bookwalker-downloader.cover-download-button {
                margin: 10px;
                display: inline-block;
            }
        `);
    } else if (window.location.href.search(/https:\/\/global.bookwalker.jp\/series\/.*/gi) > -1) {
        bookwalkerCoverDownloader(
            'data-srcset',
            $('.title-main-inner').text().split('\n                            ')[1],
            $('.o-tile-list').first(), `
            <p id="cover-download-as-jpeg" class="btn-cart-add btn-box m-b40 bookwalker-downloader cover-download-button"></p>
            <p id="cover-download-as-zip" class="btn-cart-add btn-box m-b40 bookwalker-downloader cover-download-button"></p>
            <p id="cover-select-all" class="btn-cart-add btn-box m-b40 bookwalker-downloader cover-download-button"></p>
            `, `
            p.bookwalker-downloader.cover-download-button {
                cursor: pointer; 
                display: inline-block;
            }
        `);
    }

    function bookwalkerCoverDownloader(dataAttribute, titleSection, coverSection, html, css) {
        const coverImages = $('img.lazy');
        let coverUrls = {
            'c.bookwalker.jp': {},
            'blob': {}
        };
        let busyDownloading = false;

        coverSection.before(`<div id="cover-download-button-container" class="bookwalker-downloader">${html}<p id="cover-download-error" class="bookwalker-downloader hidden"></p></div>`);

        function displayError(error) {
            const errorContainer = $('.bookwalker-downloader#cover-download-error');

            errorContainer.removeClass('hidden').append(`<p>Error: ${error}</p>`).animate({
                scrollTop: errorContainer.prop("scrollHeight")
            }, 'fast');
            console.error(error);
        }

        coverImages.each(function() {
            coverUrls['c.bookwalker.jp'][$(this).attr('title')] = `https://c.bookwalker.jp/coverImage_${(parseInt($(this).attr(dataAttribute).split('/')[3].split('').reverse().join('')) - 1)}.jpg`;

            $(this).addClass('bookwalker-downloader');
            $(this).removeClass('cover-selected').parent().removeAttr('href').addClass('bookwalker-downloader');
            $(this).on('click', function () {
                if (busyDownloading === false) {
                    if ($(this).hasClass('cover-selected')) {
                        $(this).removeClass('cover-selected');
                    } else {
                        $(this).addClass('cover-selected');
                    }
                }
            });
        });

        function createButton(id, text) {
            const currentButton = $(`.bookwalker-downloader.cover-download-button#${id}`);

            currentButton.html(`
                <a class="bookwalker-downloader">
                    <span id="cover-download-text" class="bookwalker-downloader">${text}</span>
                    <span id="cover-download-status" class="bookwalker-downloader hidden"></span>
                    <span id="cover-download-progress" class="bookwalker-downloader hidden"></span>                        
                    <span id="cover-download-percent" class="bookwalker-downloader hidden"></span>
                </a>
            `);

            currentButton.on('click', function() {
                if (busyDownloading === false) {
                    const selectedCovers = $('.bookwalker-downloader.cover-selected');
                    const saveAsNameRegex = /[\\\/:"*?<>|]/gi;

                    function coverDownloadProgress(percent, status) {
                        currentButton.children('a').children('span[id="cover-download-text"]').addClass('hidden');
                        currentButton.children('a').children('span[id="cover-download-status"]').removeClass('hidden').html(`<p>${status}</p>`);
                        currentButton.children('a').children('span[id="cover-download-progress"]').removeClass('hidden').html(`<progress max="100" value="${percent}"></progress>`);
                        currentButton.children('a').children('span[id="cover-download-percent"]').removeClass('hidden').html(`<p>${Math.round(percent * 100) / 100}%</p>`);
                        if (percent >= 100) {
                            currentButton.children('a').children('span[id="cover-download-text"]').removeClass('hidden')
                            currentButton.children('a').children('span[id="cover-download-status"]').addClass('hidden').html('');
                            currentButton.children('a').children('span[id="cover-download-progress"]').addClass('hidden').html('');
                            currentButton.children('a').children('span[id="cover-download-percent"]').addClass('hidden').html('');
                        }
                    }

                    function getBestQualityCovers() {
                        const maxRetry403Count = 8;
                        let retry403Count = {};

                        function getAJAX(url, title) {
                            GM_xmlhttpRequest({
                                method: 'GET',
                                url: url,
                                responseType: 'blob',
                                onload: onloadAJAX,
                                onabort: reportAJAX_Error,
                                onerror: reportAJAX_Error,
                                ontimeout: reportAJAX_Error
                            });
                            function onloadAJAX(rspObj) {
                                if (rspObj.status !== 200 && rspObj.status !== 403 || rspObj.status === 403 && retry403Count[title] >= maxRetry403Count || !rspObj.finalUrl.indexOf(/https:\/\/c.bookwalker.jp\/coverImage_.[0-9]*.jpg/g)) {
                                    displayError(`${rspObj.status} ${rspObj.statusText} ${title} ${rspObj.finalUrl}`);
                                }
                                if (rspObj.status === 403 && retry403Count[title] < maxRetry403Count) {
                                    getAJAX(`https://c.bookwalker.jp/coverImage_${(parseInt(rspObj.finalUrl.replace(/^\D+|\D+$/g, "") - 1))}.jpg`, title);
                                    retry403Count[title] = retry403Count[title] + 1;
                                } else {
                                    coverUrls['blob'][title] = window.URL.createObjectURL(rspObj.response);
                                }
                                coverDownloadProgress(Object.keys(coverUrls['blob']).length / selectedCovers.length * 100, 'Downloading covers...');
                            }
                            function reportAJAX_Error(rspObj) {
                                displayError(`${rspObj.status} ${rspObj.statusText} ${title} ${rspObj.finalUrl}`);
                            }
                        }

                        selectedCovers.each(function () {
                            retry403Count[$(this).attr('title')] = 0;

                            getAJAX(coverUrls['c.bookwalker.jp'][$(this).attr('title')], $(this).attr('title'));
                        });
                    }

                    function downloadCoversAsJPEG() {
                        selectedCovers.each(function() {
                            saveAs(coverUrls['blob'][$(this).attr('title')], $(this).attr('title').replace(saveAsNameRegex, '') + '.jpg');
                        });
                    }

                    function urlToPromise(url) {
                        return new Promise(function(resolve, reject) {
                            JSZipUtils.getBinaryContent(url, function (err, config) {
                                if (err) {
                                    reject(err);
                                    displayError(`${err} ${url}`);
                                } else {
                                    resolve(config);
                                }
                            });
                        });
                    }
                    function downloadCoversAsZIP() {
                        const zip = new JSZip();
                        selectedCovers.each(function() {
                            zip.file($(this).attr('title').replace(saveAsNameRegex, '') + '.jpg', urlToPromise(coverUrls['blob'][$(this).attr('title')]), {binary:true});
                        });
                        zip.generateAsync({type:'blob', streamFiles: true}, function updateCallback(metaconfig) {
                            coverDownloadProgress(metaconfig.percent, 'Zipping covers...');
                        })
                            .then(function callback(blob) {
                                saveAs(blob, titleSection.replace(saveAsNameRegex, '') + '.zip');
                            });
                    }

                    function selectAllCovers() {
                        if (currentButton.children('a').children('span[id="cover-download-text"]').text() === 'Deselect All') {
                            selectedCovers.each(function() {
                                $(this).removeClass('cover-selected');
                            });
                            currentButton.children('a').children('span[id="cover-download-text"]').text('Select All');
                        } else if (currentButton.children('a').children('span[id="cover-download-text"]').text() === 'Select All') {
                            coverImages.each(function() {
                                $(this).addClass('cover-selected');
                            });
                            currentButton.children('a').children('span[id="cover-download-text"]').text('Deselect All');
                        }
                    }

                    function replaceCovers() {
                        selectedCovers.each(function () {
                            $(this).attr(dataAttribute, coverUrls['blob'][$(this).attr('title')]).attr('src', coverUrls['blob'][$(this).attr('title')]).attr('srcset', coverUrls['blob'][$(this).attr('title')]);
                        })
                    }

                    function coverUrlsCheck() {
                        if (busyDownloading === true) {
                            if (Object.keys(coverUrls['blob']).length >= selectedCovers.length) {
                                replaceCovers()
                                try {
                                    if (id === 'cover-download-as-jpeg') {
                                        downloadCoversAsJPEG();
                                    } else if (id === 'cover-download-as-zip') {
                                        downloadCoversAsZIP();
                                    }
                                } catch (e) {
                                    displayError(e.message);
                                } finally {
                                    coverUrls['blob'] = {};
                                    busyDownloading = false;
                                    coverDownloadProgress(100);
                                }
                            } else {
                                setTimeout(coverUrlsCheck, 100);
                            }
                        }
                    }

                    if (id === 'cover-select-all') {
                        selectAllCovers();
                    } else if (selectedCovers.length > 0) {
                        busyDownloading = true;
                        try {
                            getBestQualityCovers();
                        } catch (e) {
                            busyDownloading = false;
                            displayError(e.message);
                        } finally {
                            coverDownloadProgress(100);
                        }
                        coverUrlsCheck();
                    }
                }
            });
        }

        createButton('cover-download-as-jpeg', 'Download Selected Covers as JPEG');
        createButton('cover-download-as-zip', 'Download Selected Covers as ZIP');
        createButton('cover-select-all', 'Select All');

        GM_addStyle (css + `
            div.bookwalker-downloader#cover-download-button-container {
                width: 100%; 
                text-align: center;
            }
            img.lazy.bookwalker-downloader {
                opacity: 0.5;
            }
            img.lazy.bookwalker-downloader.cover-selected {
                opacity: 1;
            }
            .bookwalker-downloader.hidden {
                display: none;
            }
            a.bookwalker-downloader {
                text-decoration: none;
                cursor: pointer;
            }
            p.bookwalker-downloader#cover-download-error {
                color: red;
                max-height: 60px;
                overflow-y: scroll;
                margin: 10px;
            }
        `);
    }
})();
