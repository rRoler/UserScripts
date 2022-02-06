// ==UserScript==
// @name         BookWalker Cover Downloader
// @namespace    https://github.com/RolerGames/UserScripts
// @version      0.1
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
            $('.o-contents-section__body').first(),
            `<button id="cover-download-as-jpeg" class="a-basic-btn--secondary bookwalker-downloader cover-download-button"></button>
            <button id="cover-download-as-zip" class="a-basic-btn--secondary bookwalker-downloader cover-download-button"></button>
            <button id="cover-select-all" class="a-basic-btn--secondary bookwalker-downloader cover-download-button"></button>
            `,`
            button.bookwalker-downloader.cover-download-button {
                margin: 10px;
                display: inline-block;
            }
        `);
    } else if (window.location.href.search(/https:\/\/global.bookwalker.jp\/series\/.*/gi) > -1) {
        bookwalkerCoverDownloader(
            'data-srcset',
            $('.title-main-inner').text().split('\n                            ')[1],
            $('.o-tile-list').first(),
            `<p id="cover-download-as-jpeg" class="btn-cart-add btn-box m-b40 bookwalker-downloader cover-download-button"></p>
            <p id="cover-download-as-zip" class="btn-cart-add btn-box m-b40 bookwalker-downloader cover-download-button"></p>
            <p id="cover-select-all" class="btn-cart-add btn-box m-b40 bookwalker-downloader cover-download-button"></p>
            `,`
            p.bookwalker-downloader.cover-download-button {
                cursor: pointer; 
                display: inline-block;
            }
        `);
    }

    function bookwalkerCoverDownloader(dataLink, titleSection, coverSection, html, css) {
        const coverImages = $('img.lazy');
        let coverUrls = {};
        let busyDownloading = false;

        coverSection.before('<div id="cover-download-button-container" class="bookwalker-downloader">' + html + '<p id="cover-download-error" class="bookwalker-downloader hidden"></p></div>');

        function displayError(error) {
            const errorContainer = $('.bookwalker-downloader#cover-download-error');

            errorContainer.removeClass('hidden').append('<p>Error: ' + error + '</p>').animate({
                scrollTop: errorContainer.prop("scrollHeight")
            }, 'fast');
            console.error(error);
        }

        coverImages.each(function() {
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
            const currentButton = $('.bookwalker-downloader.cover-download-button#' + id);

            currentButton.html(`
                <a class="bookwalker-downloader">
                    <span id="cover-download-text" class="bookwalker-downloader">` + text + `</span>
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
                        currentButton.children('a').children('span[id="cover-download-status"]').removeClass('hidden').html('<p>' + status + '</p>');
                        currentButton.children('a').children('span[id="cover-download-progress"]').removeClass('hidden').html('<progress max="100" value="0"></progress>').children('progress').val(percent);
                        currentButton.children('a').children('span[id="cover-download-percent"]').removeClass('hidden').html('<br>' + Math.round(percent * 100) / 100 + '%');
                        if (percent >= 100) {
                            currentButton.children('a').children('span[id="cover-download-text"]').removeClass('hidden')
                            currentButton.children('a').children('span[id="cover-download-status"]').addClass('hidden').html('');
                            currentButton.children('a').children('span[id="cover-download-progress"]').addClass('hidden').html('');
                            currentButton.children('a').children('span[id="cover-download-percent"]').addClass('hidden').html('');
                        }
                    }

                    function getBestQualityCovers() {
                        function onloadAJAX(rspObj) {
                            if (rspObj.status !== 200 || !rspObj.finalUrl.indexOf(/https:\/\/c.bookwalker.jp\/coverImage_.[0-9]*.jpg/g)) {
                                displayError(rspObj.status + ' ' + rspObj.statusText + ' ' + rspObj.finalUrl);
                            }
                            coverUrls[rspObj.finalUrl] = window.URL.createObjectURL(rspObj.response);
                            coverDownloadProgress(Object.keys(coverUrls).length / selectedCovers.length * 100, 'Downloading covers...');
                        }
                        function reportAJAX_Error(rspObj) {
                            displayError(rspObj.status + ' ' + rspObj.statusText + ' ' + rspObj.finalUrl);
                        }
                        selectedCovers.each(function () {
                            GM_xmlhttpRequest({
                                method: 'GET',
                                url: 'https://c.bookwalker.jp/coverImage_' + (parseInt($(this).attr(dataLink).split('/')[3].split('').reverse().join('')) - 1) + '.jpg',
                                responseType: 'blob',
                                onload: onloadAJAX,
                                onabort: reportAJAX_Error,
                                onerror: reportAJAX_Error,
                                ontimeout: reportAJAX_Error
                            });
                        });
                    }

                    function downloadCoversAsJPEG() {
                        selectedCovers.each(function() {
                            saveAs(coverUrls['https://c.bookwalker.jp/coverImage_' + (parseInt($(this).attr(dataLink).split('/')[3].split('').reverse().join('')) - 1) + '.jpg'], $(this).attr('title').replace(saveAsNameRegex, '') + '.jpg'
                            );
                        });
                    }

                    function urlToPromise(url) {
                        return new Promise(function(resolve, reject) {
                            JSZipUtils.getBinaryContent(url, function (err, config) {
                                if (err) {
                                    reject(err);
                                    displayError(err.replace('Error: ', '') + ' ' + url);
                                } else {
                                    resolve(config);
                                }
                            });
                        });
                    }
                    function downloadCoversAsZIP() {
                        const zip = new JSZip();
                        selectedCovers.each(function() {
                            zip.file($(this).attr('title').replace(saveAsNameRegex, '') + '.jpg', urlToPromise(coverUrls['https://c.bookwalker.jp/coverImage_' + (parseInt($(this).attr(dataLink).split('/')[3].split('').reverse().join('')) - 1) + '.jpg']), {binary:true});
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

                    function coverLinksCheck() {
                        if (Object.keys(coverUrls).length >= selectedCovers.length) {
                            try {
                                if (id === 'cover-download-as-jpeg') {
                                    downloadCoversAsJPEG();
                                } else if (id === 'cover-download-as-zip') {
                                    downloadCoversAsZIP();
                                }
                            } catch (e) {
                                displayError(e.message);
                            } finally {
                                coverUrls = {};
                                busyDownloading = false;
                                coverDownloadProgress(100, '');
                            }
                        } else {
                            setTimeout(coverLinksCheck, 100);
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
                            coverDownloadProgress(100, '');
                        }
                        coverLinksCheck();
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
