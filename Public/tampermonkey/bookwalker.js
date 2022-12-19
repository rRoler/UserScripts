// ==UserScript==
// @name         BookWalker Cover Downloader
// @namespace    https://github.com/rRoler/UserScripts
// @version      0.9.9-dev
// @description  Select covers on the https://bookwalker.jp/series/*/list/* or https://global.bookwalker.jp/series/* page and download them.
// @author       Roler
// @match        https://bookwalker.jp/*
// @match        https://r18.bookwalker.jp/*
// @match        https://global.bookwalker.jp/*
// @icon         https://bookwalker.jp/favicon.ico
// @require      https://cdnjs.cloudflare.com/ajax/libs/jquery/3.6.0/jquery.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/jszip/3.7.1/jszip.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/jszip-utils/0.1.0/jszip-utils.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/FileSaver.js/2.0.5/FileSaver.min.js
// @require      https://openuserjs.org/src/libs/sizzle/GM_config.js
// @updateURL    https://raw.githubusercontent.com/rRoler/UserScripts/master/Public/tampermonkey/bookwalker.js
// @downloadURL  https://raw.githubusercontent.com/rRoler/UserScripts/master/Public/tampermonkey/bookwalker.js
// @supportURL   https://github.com/rRoler/UserScripts/issues
// @grant        GM_xmlhttpRequest
// @grant        GM_download
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM_setClipboard
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
                'title': 'The source to download the covers from.\n "Automatic" compares both sources and downloads from the higher quality one.\n "viewer-epubs-trial.bookwalker.jp" is much slower and won\'t work with a paid or free book unless it has a preview.',
                'options': ['Automatic', 'c.bookwalker.jp', 'viewer-epubs-trial.bookwalker.jp'],
                'default': 'Automatic'
            },
            'downloadPage': {
                'label': 'Download preview page:',
                'type': 'int',
                'title': '0 = cover\n min=0, max=256.\n The page to download from the preview (viewer-epubs-trial.bookwalker.jp).\n If the number is bigger than the last page of the preview, the last page will be downloaded.',
                'min': 0,
                'max': 256,
                'default': 0
            },
            'downloadOnLoad': {
                'label': 'Automatic download',
                'type': 'checkbox',
                'title': 'Download all covers automatically when you open the series list page.',
                'default': false
            },
            'maxConcurrentDownloads': {
                'label': 'Maximum concurrent downloads:',
                'type': 'int',
                'title': 'min=1, max=128.\n Maximum number of files to download at the same time.',
                'min': 1,
                'max': 128,
                'default': 128
            },
            'max403Retries': {
                'label': 'Maximum download retries:',
                'type': 'int',
                'title': 'min=0, max=16.\n Maximum number of times to change the cover URL and try to download the cover if the expected URL is wrong.',
                'min': 0,
                'max': 16,
                'default': 4
            },
            'imageFileNameMask': {
                'label': 'Image filename:',
                'section': ['File Saving Settings', '<b>For images, zips, folders and links:</b><br> %seriesTitle% = Title of the series<br> %fileExtension% = Extension of the file<br> <b>For images, folders and links:</b><br> %volumeTitle% = Title of the book/volume<br> %number% = Increasing number<br> %fileName% = Name of the file from the image URL<br> %fileNameId% = The id of the file from the image URL<br> %elementId% = Id of the html image element<br> <b>Only for links:</b><br> %coverURL% = URL of the cover image<br> %newLine% = Adds a new line'],
                'type': 'text',
                'title': '',
                'size': 128,
                'default': '%volumeTitle%.%fileExtension%'
            },
            'zipFileNameMask': {
                'label': 'Zip filename:',
                'type': 'text',
                'title': '',
                'size': 128,
                'default': '%seriesTitle%.%fileExtension%'
            },
            'clipboardMask': {
                'label': 'Copied links format:',
                'type': 'text',
                'title': '',
                'size': 128,
                'default': '[%volumeTitle%](%coverURL%)%newLine%'
            },
            'imageSaveLocationCheck': {
                'label': 'Image save location',
                'type': 'checkbox',
                'title': 'Enable the image save location.\n ! ! ! WARNING ! ! !\n This works only with Tampermonkey on Firefox and it uses GM_download which does not support blob URLs anymore, so the covers will be redownloaded again when saving!',
                'default': false
            },
            'imageSaveLocation': {
                'label': 'Image save location:',
                'type': 'text',
                'title': 'Path (inside the default download folder) in which cover images will be saved.',
                'size': 128,
                'default': 'Cover Art/BookWalker/%fileExtension%/%seriesTitle%/'
            },
            'revertCoversAfterSave': {
                'label': 'Revert covers after saving',
                'type': 'checkbox',
                'title': 'Reverts covers and removes blobs after saving.\n This may free up memory even if you don\'t unload (change, close or refresh) the page, but the covers will be redownloaded if you want to save them again.',
                'default': true
            },
            'saveAsJPEGConfirm': {
                'label': 'Confirm saving covers individually if selected covers are more than:',
                'type': 'int',
                'title': '0 = disabled\n min=0, max=64.\n Ask for confirmation before saving more than this number of covers.',
                'min': 0,
                'max': 64,
                'default': 0
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
                'label': 'Show cover hyperlink',
                'type': 'checkbox',
                'title': 'Show a hyperlink that links to the new cover.',
                'default': true
            },
            'redirectSeriesPages': {
                'label': 'Redirect the series page to list',
                'section': ['BookWalker Japan Settings', 'https://bookwalker.jp/'],
                'type': 'checkbox',
                'title': 'Redirect the series pages to the series list pages.',
                'default': true
            }
        },
        'events': {
            'save': () => needsReload = true,
            'close': () => needsReload ? location.reload():false
        }
    }
    GM_config.init(bookwalkerConfig);
    GM_registerMenuCommand('Settings', () => GM_config.open());

    let bookwalkerCoverDownloaderPageConfig = {
        dataAttribute: 'data-original',
        titleSection: $('.o-contents-section__title').text(),
        coverSection: $('.o-contents-section__body').first(),
        buttonData: {
            tag: 'button',
            class: 'a-basic-btn--secondary'
        },
        css: `
           button.bookwalker-cover-downloader.a-basic-btn--secondary {
               margin: 2px;
               display: inline-block;
               max-width: 256px;
           }
           a.m-thumb__image.bookwalker-cover-downloader {
               position: static;
           }
           img.bookwalker-cover-downloader.cover-selected {
               outline: solid #5a8d48 4px;
           }
           #bookwalker-cover-downloader-source-select select {
               background-color: #5a8d48;
           }`
    }
    if (window.location.href.search(/https:\/\/bookwalker.jp\/series\/.*/gi) > -1 || window.location.href.search(/https:\/\/r18.bookwalker.jp\/series\/.*/gi) > -1) {
        if (window.location.href.search(/https:\/\/.*\/series\/.*\/list\/.*/gi) <= -1) {
            const wayomiCoverSection = $('.p-content-top');
            if (wayomiCoverSection) {
                // TODO
            }
            if (GM_config.get('redirectSeriesPages') && $(`a[href="${window.location.href}list/"]`).length > 0)
                return window.location.replace(`${window.location.href}list/`);
        } else return bookwalkerCoverDownloader(bookwalkerCoverDownloaderPageConfig);
    }
    if (window.location.href.search(/https:\/\/bookwalker.jp\/de[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi) > -1) {
        bookwalkerCoverDownloaderPageConfig.titleSection = $('.p-main__title').text();
        bookwalkerCoverDownloaderPageConfig.coverSection = $('.p-main').first();
        bookwalkerCoverDownloaderPageConfig.singleCover = true;
        return bookwalkerCoverDownloader(bookwalkerCoverDownloaderPageConfig);
    }
    bookwalkerCoverDownloaderPageConfig = {
        dataAttribute: 'data-srcset',
        titleSection: $('.title-main-inner').text().split('\n                            ')[1],
        coverSection: $('.o-tile-list').first(),
        buttonData: {
            tag: 'p',
            class: 'btn-cart-add btn-box m-b40'
        },
        css: `
        p.bookwalker-cover-downloader.btn-cart-add.btn-box.m-b40 {
            margin: 2px;
            cursor: pointer; 
            display: inline-block;
            max-width: 256px;
        }
        img.bookwalker-cover-downloader.cover-selected {
            outline: solid #ff8114 4px;
        }
        #bookwalker-cover-downloader-source-select select {
            background-color: #ff8114;
        }`
    }
    if (window.location.href.search(/https:\/\/global.bookwalker.jp\/series\/.*/gi) > -1) {
        return bookwalkerCoverDownloader(bookwalkerCoverDownloaderPageConfig);
    }
    if (window.location.href.search(/https:\/\/global.bookwalker.jp\/de[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi) > -1) {
        bookwalkerCoverDownloaderPageConfig.dataAttribute = 'src';
        bookwalkerCoverDownloaderPageConfig.titleSection = $('.detail-book-title.clearfix').children('h1')[0].firstChild.textContent;
        bookwalkerCoverDownloaderPageConfig.coverSection = $('.wrap.clearfix').first();
        bookwalkerCoverDownloaderPageConfig.singleCover = true;
        bookwalkerCoverDownloaderPageConfig.imageSelector = $('.book-img').children('a').children('img');
        return bookwalkerCoverDownloader(bookwalkerCoverDownloaderPageConfig);
    }
    return false;

    function bookwalkerCoverDownloader({
       dataAttribute,
       titleSection,
       coverSection,
       buttonData = {tag: '', class: ''},
       css,
       singleCover = false,
       imageSelector = $('img.lazy')
    }) {
        const config = {};
        $.each(bookwalkerConfig.fields, function (i) {
            config[i] = GM_config.get(i);
        });
        const concurrentDownloads = {
            max: config.maxConcurrentDownloads,
            count: 0
        }
        const saveAsNameRegex = /[\\\/:"*?<>|]/gi;
        const coverData = {
            image: singleCover ? imageSelector.first():imageSelector,
            source: bookwalkerConfig.fields.downloadSource.options,
            knownFileName: {},
            cover: {},
            extension: 'jpg',
            selected: [],
            lastSelected: undefined,
            maxPage: 0
        }
        coverData.selectable = coverData.image.length;
        const checkTimeout = 200;
        let busyDownloading = false;
        buttonData.button = {
            downloadAsJpeg: {
                id: 'bookwalker-cover-downloader-download-as-jpeg',
                text: ['Save Covers Individually'],
                execute: (button) => saveCovers(saveCoversAsJPEG, button),
                element: undefined
            },
            downloadAsZip: {
                id: 'bookwalker-cover-downloader-download-as-zip',
                text: ['Save Covers Inside a ZIP'],
                execute: (button) => saveCovers(saveCoversAsZIP, button),
                element: undefined
            },
            copyLinks: {
                id: 'bookwalker-cover-downloader-copy-links',
                text: ['Copy Cover Links'],
                execute: (button) => saveCovers(copyCoverLinks, button),
                element: undefined
            },
            selectAll: {
                id: 'bookwalker-cover-downloader-select-all',
                text: ['Select All', 'Deselect All'],
                execute: (button) => selectAllCovers(button),
                element: undefined
            },
            setSource: {
                id: 'bookwalker-cover-downloader-set-source',
                text: ['Set Download Source'],
                execute: (button) => setSource(button),
                element: undefined
            }
        }
        if (singleCover) {
            buttonData.button.downloadAsJpeg.text = ['Save Cover'];
            buttonData.button.copyLinks.text = ['Copy Cover Link'];
            delete buttonData.button.downloadAsZip;
            delete buttonData.button.selectAll;
        }
        buttonData.other = {
            fixCover: {
                text: ['Try to Fix', 'Revert', 'Fixing...', 'Reverting...']
            }
        }

        coverSection.before(`
            <div id="bookwalker-cover-downloader-main-div" class="bookwalker-cover-downloader">
                <div id="bookwalker-cover-downloader-source-select" class="bookwalker-cover-downloader">
                    <select id="bookwalker-cover-downloader-source-url-select" class="bookwalker-cover-downloader"></select>
                    <select id="bookwalker-cover-downloader-source-page-select" class="bookwalker-cover-downloader"></select>
                </div>
                <div id="bookwalker-cover-downloader-buttons" class="bookwalker-cover-downloader"></div>
                <div id="bookwalker-cover-downloader-errors" class="bookwalker-cover-downloader hidden"></div>
            </div>
        `);

        $.each(coverData.source, function (i, source) {
            const optionElement = $(`<option value="${source}">Source: ${source}</option>`);
            if (config.downloadSource === source) optionElement.attr('selected', 'selected');
            $('#bookwalker-cover-downloader-source-url-select').append(optionElement);
        });
        createPageSelect(bookwalkerConfig.fields.downloadPage.max);
        $.each(buttonData.button, function (i, button) {
            if (button === buttonData.button.setSource)
                $('#bookwalker-cover-downloader-source-select').append(createButton(i, button));
            else
                $('#bookwalker-cover-downloader-buttons').append(createButton(i, button));
        });

        coverData.image.each(addCoverData);

        $('.bookwalker-cover-downloader.download-progress').append(`
            <p class="bookwalker-cover-downloader download-progress progress-status"></p>
            <progress class="bookwalker-cover-downloader download-progress progress-bar" max="100" value="0"></progress>
            <p class="bookwalker-cover-downloader download-progress progress-percent"></p>
        `);

        coverData.image.each(getCoverUrl);

        if (singleCover) coverData.image.each((i, element) => selectCover($(element)));
        else if (config.downloadOnLoad) downloadAll();

        function displayError(message) {
            const container = $('#bookwalker-cover-downloader-errors');

            container.removeClass('hidden').append(`<p>Error: ${message}</p>`).animate({
                scrollTop: container.prop("scrollHeight")
            }, 'fast');
            console.error(message);
        }
        function addCoverData(i, element) {
            const id = `bookwalker-cover-downloader-cover-${i}`;
            coverData.cover[id] = {
                title: singleCover ? titleSection:$(element).attr('title'),
                blob: {},
                [coverData.source[1]]: {},
                [coverData.source[2]]: {},
                selectable: true,
                clicked: false,
                fixStatus: buttonData.other.fixCover.text[0],
                rimgCoverUrl: $(element).attr(dataAttribute),
                number: i + 1
            }

            $(element).attr('id', id);
            $(element).before(`
                <span class="bookwalker-cover-downloader cover-data cover-size hidden"></span>
                <span class="bookwalker-cover-downloader cover-data cover-fix hidden"><p>${coverData.cover[id].fixStatus}</p></span>
                <span class="bookwalker-cover-downloader cover-data cover-link hidden"></span>
                <span class="bookwalker-cover-downloader cover-data download-progress hidden"></span>
            `);
            $(element).parent().children('.cover-fix').children('p').on('click', fixCover);
            $(element).addClass('bookwalker-cover-downloader');
            $(element).removeClass('cover-selected').parent().removeAttr('href').addClass('bookwalker-cover-downloader');
            $(element).on('mousedown', coverClick);
        }
        function coverClick(event) {
            const element = $(event.currentTarget)

            if (element.hasClass('cover-selected')) {
                onClick(false);
            } else {
                onClick();
            }

            function onClick(select = true) {
                if (event.shiftKey && coverData.lastSelected) {
                    const currentCoverIndex = Object.values(coverData.image).indexOf(element[0]);
                    const lastSelectedCoverIndex = Object.values(coverData.image).indexOf(coverData.lastSelected[0]);

                    if (currentCoverIndex > lastSelectedCoverIndex) {
                        for (let i = lastSelectedCoverIndex; i <= currentCoverIndex; i++) {
                            selectCover($(coverData.image[i]), select);
                        }
                    } else {
                        for (let i = lastSelectedCoverIndex; i >= currentCoverIndex; i--) {
                            selectCover($(coverData.image[i]), select);
                        }
                    }
                } else {
                    selectCover(element, select);
                }
            }
        }
        function selectCover(element, select = true) {
            if (!busyDownloading) {
                const id = element.attr('id');

                if (coverData.cover[id].selectable) coverData.lastSelected = element;
                if (select && coverData.cover[id].selectable) {
                    element.addClass('cover-selected');

                    if (!coverData.cover[id].clicked) {
                        try {
                            getBestQualityCover(element);
                        } catch (e) {
                            displayError(e.message);
                        }
                    }
                } else if (!select) {
                    element.removeClass('cover-selected');
                }

                coverData.selected = $('.bookwalker-cover-downloader.cover-selected');

                if (!singleCover) {
                    if (coverData.selected.length >= coverData.selectable)
                        buttonData.button.selectAll.status = buttonData.button.selectAll.text[1];
                    else
                        buttonData.button.selectAll.status = buttonData.button.selectAll.text[0];
                    buttonData.button.selectAll.element.children('a').children('.button-text').text(buttonData.button.selectAll.status);
                }
            }
        }
        async function readyToDownload() {
            return await new Promise(function (resolve) {
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
        function AJAXRequest(url, type, fn, element, status, source) {
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
                try {
                    fn(rspObj);
                } finally {
                    --concurrentDownloads.count;
                    displayProgress(element.parent().children('.download-progress'), 100);
                }
            }
            function reportError() {
                const id = element.attr('id');

                --concurrentDownloads.count;
                coverData.cover[id][source].urlStatus = false;
                displayProgress(element.parent().children('.download-progress'), 100);
            }
        }
        function getCoverUrl(i, element) {
            const id = $(element).attr('id');
            const getUrl = {
                get: (url, fn, source) => AJAXRequest(url, 'json', fn, $(element), 'Getting cover URL...', source)
            }

            getUrl[coverData.source[1]] = function () {
                const url = `https://c.bookwalker.jp/coverImage_${(parseInt(coverData.cover[id].rimgCoverUrl.split('/')[3].split('').reverse().join('')) - 1)}.${coverData.extension}`;

                coverData.cover[id][coverData.source[1]].url = url;
            }
            getUrl[coverData.source[2]] = function () {
                const uuid = singleCover ? window.location.href.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi):!$(element).parent().attr('data-uuid') ? $(element).parent().parent().parent().children('.a-tile-ttl').children('a').attr('href').split('/')[3].replace(/de/, ''):$(element).parent().attr('data-uuid');

                getUrl.get(`https://viewer-trial.bookwalker.jp/trial-page/c?cid=${uuid}&BID=0`, getAuthInfo, coverData.source[2]);

                function getAuthInfo(rspObj) {
                    const rspObjData = rspObj.response;

                    if (rspObj.status !== 200 || rspObjData.status !== '200') {
                        coverData.cover[id][coverData.source[2]].urlStatus = false;
                    } else {
                        const book = {
                            url: `${rspObjData.url}${rspObjData.cty === 0 ? 'normal_default/':''}`
                        }
                        const auth = {
                            pfCd: rspObjData.auth_info['pfCd'],
                            policy: rspObjData.auth_info['Policy'],
                            signature: rspObjData.auth_info['Signature'],
                            keyPairId: rspObjData.auth_info['Key-Pair-Id']
                        }
                        auth.string = `?pfCd=${auth.pfCd}&Policy=${auth.policy}&Signature=${auth.signature}&Key-Pair-Id=${auth.keyPairId}`;

                        getUrl.get(`${book.url}configuration_pack.json${auth.string}`, getMetadata, coverData.source[2]);

                        function getMetadata(rspObj) {
                            const rspObjData = rspObj.response;

                            if (rspObj.status !== 200) {
                                coverData.cover[id][coverData.source[2]].urlStatus = false;
                            } else {
                                book.chapters = rspObjData.configuration.contents;
                                book.pages = [];
                                $.each(book.chapters, function (i, chapter) {
                                    $.each(rspObjData[chapter.file].FileLinkInfo.PageLinkInfoList, function (i, value) {
                                        const page = value.Page;
                                        page.chapter = chapter;
                                        book.pages.push(page);
                                    });
                                });

                                let maxPageIndex = bookwalkerConfig.fields.downloadPage.max;
                                if (!book.pages[maxPageIndex]) {
                                    maxPageIndex = book.pages.length - 1;
                                    if (maxPageIndex > coverData.maxPage) {
                                        coverData.maxPage = maxPageIndex;
                                        if (config.downloadPage > coverData.maxPage) config.downloadPage = coverData.maxPage;
                                        createPageSelect(coverData.maxPage);
                                    }
                                }
                                let pageIndex = config.downloadPage;
                                if (!book.pages[pageIndex]) pageIndex = maxPageIndex;
                                const page = {
                                    path: book.pages[pageIndex].chapter.file,
                                    number: book.pages[pageIndex].No,
                                    type: book.pages[pageIndex].chapter.type,
                                    size: book.pages[pageIndex].Size
                                }
                                page.url = `${book.url}${page.path}/${page.number}.${page.type}${auth.string}`;
                                coverData.cover[id][coverData.source[2]].filePath = page.path;
                                coverData.cover[id][coverData.source[2]].width = page.size.Width;
                                coverData.cover[id][coverData.source[2]].height = page.size.Height;
                                coverData.cover[id][coverData.source[2]].url = page.url;
                            }
                        }
                    }
                }
            }

            if (config.downloadSource === coverData.source[0]) {
                $.each(coverData.source, function (i, source) {
                    if (source !== coverData.source[0]) {
                        try {
                            coverData.cover[id][source].urlStatus = true;

                            getUrl[source]();
                        } catch (e) {
                            coverData.cover[id][source].urlStatus = false;
                        }
                    }
                });
            } else {
                try {
                    coverData.cover[id][config.downloadSource].urlStatus = true;

                    getUrl[config.downloadSource]();
                } catch (e) {
                    coverData.cover[id][config.downloadSource].urlStatus = false;
                }
            }
        }
        function getBestQualityCover(element) {
            const id = element.attr('id');
            const retry403 = {
                max: config.max403Retries,
                count: 0
            }
            const getCover = {
                get: (url, fn, source) => AJAXRequest(url, 'blob', fn, element, 'Downloading cover...', source)
            }
            coverData.cover[id].clicked = true;

            getCover[coverData.source[1]] = function (rspObj) {
                if (rspObj.status !== 200 && rspObj.status !== 403 || rspObj.status === 403 && retry403.count >= retry403.max || !rspObj.finalUrl.indexOf(/https:\/\/c.bookwalker.jp\/coverImage_.[0-9]*.jpg/i)) {
                    coverData.cover[id][coverData.source[1]].urlStatus = false;
                } else if (rspObj.status === 403 && retry403.count < retry403.max) {
                    getCover.get(`https://c.bookwalker.jp/coverImage_${(parseInt(rspObj.finalUrl.replace(/^\D+|\D+$/g, '') - 1))}.${coverData.extension}`, getCover[coverData.source[1]], coverData.source[1]);
                    ++retry403.count;
                } else {
                    const blobUrl = window.URL.createObjectURL(rspObj.response);
                    const image = new Image;
                    image.src = blobUrl;
                    image.onload = function () {
                        const filePath = rspObj.finalUrl.replace(/https:\/\//, '');

                        coverData.cover[id][coverData.source[1]].filePath = filePath;
                        coverData.cover[id][coverData.source[1]].url = rspObj.finalUrl;
                        coverData.cover[id][coverData.source[1]].width = image.width;
                        coverData.cover[id][coverData.source[1]].height = image.height;
                        coverData.cover[id][coverData.source[1]].blobUrl = blobUrl;
                    };
                }
            }
            getCover[coverData.source[2]] = function (rspObj) {
                if (rspObj.status !== 200) {
                    coverData.cover[id][coverData.source[2]].urlStatus = false;
                } else {
                    coverData.cover[id][coverData.source[2]].url = rspObj.finalUrl;
                    coverData.cover[id][coverData.source[2]].blobUrl = window.URL.createObjectURL(rspObj.response);
                }
            }

            if (config.downloadSource === coverData.source[0]) {
                download(coverData.source[1], function (source, url) {
                    const source1 = coverData.source[1];
                    const source2 = coverData.source[2];

                    if (!url) {
                        download(source2);
                    } else {
                        promiseUrl(source2, 'url').then(function (url) {
                            if (!url) {
                                setCover(source1, coverData.cover[id][source1].urlStatus);
                            } else {
                                if (coverData.cover[id][source1].width * coverData.cover[id][source1].height >= coverData.cover[id][source2].width * coverData.cover[id][source2].height) {
                                    if (coverData.cover[id][source1].width * coverData.cover[id][source1].height - coverData.cover[id][source2].width * coverData.cover[id][source2].height === 144000
                                        && coverData.cover[id][source1].height === 1200
                                        && coverData.cover[id][source2].height === 1200
                                        && coverData.cover[id][source1].width <= 964
                                        && coverData.cover[id][source2].width <= 844) {
                                        download(source2);
                                    } else {
                                        setCover(source1, coverData.cover[id][source1].urlStatus);
                                    }
                                } else if (coverData.cover[id][source1].width * coverData.cover[id][source1].height < coverData.cover[id][source2].width * coverData.cover[id][source2].height) {
                                    download(source2);
                                }
                            }
                        });
                    }
                });
            } else {
                download(config.downloadSource);
            }

            function download(source, fn = setCover) {
                promiseUrl(source, 'url').then(function (url) {
                    if (!url) {
                        fn(source, url);
                    } else {
                        getCover.get(url, getCover[source], source);
                        promiseUrl(source, 'blobUrl').then((url) => fn(source, url));
                    }
                });
            }
            function setCover(source, url) {
                if (!url) {
                    if (coverData.cover[id].selectable) {
                        --coverData.selectable;
                        coverData.cover[id].selectable = false;
                    }
                    coverData.cover[id].blob.url = coverData.cover[id].rimgCoverUrl;
                    coverData.cover[id].blob.coverUrl = coverData.cover[id].blob.url;
                    coverData.cover[id].blob.filePath = 'Failed to get cover';
                    coverData.cover[id].blob.fileName = 'Failed to get cover';
                    coverData.cover[id].blob.fileNameId = 'Failed to get cover';
                    coverData.cover[id].blob.width = 0;
                    coverData.cover[id].blob.height = 0;
                    selectCover(element, false);
                    displayError(`Failed to get the cover of ${coverData.cover[id].title} from ${source}`);
                } else {
                    coverData.cover[id].blob.url = coverData.cover[id][source].blobUrl;
                    coverData.cover[id].blob.coverUrl = coverData.cover[id][source].url;
                    coverData.cover[id].blob.filePath = coverData.cover[id][source].filePath.replace(/\.[^.]*$/, '');
                    coverData.cover[id].blob.fileName = coverData.cover[id].blob.filePath.split('/').pop();
                    coverData.cover[id].blob.fileNameId = coverData.cover[id].blob.fileName.replace('coverImage_', '');
                    coverData.cover[id].blob.width = coverData.cover[id][source].width;
                    coverData.cover[id].blob.height = coverData.cover[id][source].height;
                }
                $.each(coverData.source, function (i, source) {
                    if (coverData.cover[id][source] && coverData.cover[id][source].blobUrl) {
                        if (coverData.cover[id][source].blobUrl !== coverData.cover[id].blob.url)
                            URL.revokeObjectURL(coverData.cover[id][source].blobUrl);
                        delete coverData.cover[id][source].blobUrl;
                    }
                });
                displayCover(element, id);
            }
            async function promiseUrl(source, url) {
                return await new Promise(function (resolve) {
                    check();

                    function check() {
                        if (coverData.cover[id][source].urlStatus) {
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
        function displayCover(element, id, revert = false) {
            let url = coverData.cover[id].blob.url;
            let hideClass = 'removeClass'
            if (revert) {
                url = coverData.cover[id].rimgCoverUrl;
                hideClass = 'addClass';
                coverData.cover[id].fixStatus = buttonData.other.fixCover.text[0];
            }

            if (config.replaceCover) {
                element.attr(dataAttribute, url).attr('src', url).attr('srcset', url);
            }
            if (config.showTryToFix && config.downloadSource === coverData.source[0] || config.showTryToFix && config.downloadSource === coverData.source[1] || revert) {
                const fixElement = element.parent().children('.cover-fix');

                fixElement[hideClass]('hidden');
                if (coverData.cover[id].fixStatus === buttonData.other.fixCover.text[2]) {
                    coverData.cover[id].fixStatus = buttonData.other.fixCover.text[1];
                } else if (coverData.cover[id].fixStatus === buttonData.other.fixCover.text[3]) {
                    coverData.cover[id].fixStatus = buttonData.other.fixCover.text[0];
                }
                fixElement.children('p').text(coverData.cover[id].fixStatus);
            }
            if (config.showCoverSize) {
                element.parent().children('.cover-size')[hideClass]('hidden').html(`<p>${coverData.cover[id].blob.width}x${coverData.cover[id].blob.height}</p>`);
            }
            if (config.showCoverURL) {
                element.parent().children('.cover-link')[hideClass]('hidden').html(`<a href="${coverData.cover[id].blob.coverUrl}" target="_blank" rel="noopener noreferrer">${coverData.cover[id].blob.fileNameId}</a>`);
            }
        }
        function displayProgress(element, percent, status) {
            const percentRounded = `${Math.round(percent)}%`;
            if (percent > 0 && percent < 100 && percentRounded !== element.children('.progress-percent').text() || percent === 0) {
                element.parent('a').children('.button-text').addClass('hidden');
                element.removeClass('hidden');
                element.children('.progress-status').text(status);
                element.children('.progress-bar').val(percent);
                element.children('.progress-percent').text(percentRounded);
            } else if (percent >= 100) {
                element.parent('a').children('.button-text').removeClass('hidden');
                element.addClass('hidden');
            }
        }
        function fixCover(element) {
            if (!busyDownloading) {
                const currentElement = $(element.currentTarget);
                const imgElement = currentElement.parent().parent().children('img');
                const imgElementId = imgElement.attr('id');

                if (coverData.cover[imgElementId].fixStatus === buttonData.other.fixCover.text[0]) {
                    fix();
                } else if (coverData.cover[imgElementId].fixStatus === buttonData.other.fixCover.text[1]) {
                    fix(true);
                }

                function fix(revert) {
                    coverData.cover[imgElementId][coverData.source[1]].urlStatus = true;
                    if (!coverData.cover[imgElementId].selectable) {
                        coverData.cover[imgElementId].selectable = true;
                        ++coverData.selectable;
                    }
                    URL.revokeObjectURL(coverData.cover[imgElementId].blob.url);
                    delete coverData.cover[imgElementId].blob.url;
                    delete coverData.cover[imgElementId][coverData.source[1]].blobUrl;

                    if (revert) {
                        coverData.cover[imgElementId][coverData.source[1]].url = coverData.cover[imgElementId][coverData.source[1]].oldUrl;
                        coverData.cover[imgElementId].fixStatus = buttonData.other.fixCover.text[3];
                    } else {
                        coverData.cover[imgElementId][coverData.source[1]].oldUrl = coverData.cover[imgElementId][coverData.source[1]].url;
                        coverData.cover[imgElementId][coverData.source[1]].url = `https://c.bookwalker.jp/coverImage_${(parseInt(coverData.cover[imgElementId][coverData.source[1]].url.replace(/^\D+|\D+$/g, '') - 1))}.${coverData.extension}`;
                        coverData.cover[imgElementId].fixStatus = buttonData.other.fixCover.text[2];
                    }
                    currentElement.text(coverData.cover[imgElementId].fixStatus);

                    try {
                        getBestQualityCover(imgElement);
                    } catch (e) {
                        displayError(e.message);
                    }
                }
            }
        }
        function createButton(i, button) {
            button.status = button.text[0];
            buttonData.button[i].element = $(`
                <${buttonData.tag} id="${button.id}" class="${buttonData.class} bookwalker-cover-downloader">
                    <a class="bookwalker-cover-downloader">
                        <span class="bookwalker-cover-downloader button-text">${button.status}</span>
                        <span class="bookwalker-cover-downloader download-progress hidden"></span>
                    </a>
                </${buttonData.tag}>
            `)
            buttonData.button[i].element.on('click', (event) => button.execute($(event.currentTarget)));
            return buttonData.button[i].element;
        }
        function createPageSelect(maxPage) {
            const pageSelectElement = $('#bookwalker-cover-downloader-source-page-select');

            pageSelectElement.empty();
            for (let i = 0; i <= maxPage; i++) {
                const optionElement = $(`<option value="${i}">Page: ${i}</option>`);
                if (config.downloadPage === i) optionElement.attr('selected', 'selected');
                pageSelectElement.append(optionElement);
            }
        }
        async function coverUrlsCheck(element, covers = coverData.selected, source = 'blob', status = 'Downloading covers...') {
            busyDownloading = true;
            let checked = 0;

            covers.each(promiseUrls);

            return await promiseUrls();

            function promiseUrls(i, selectedElement) {
                const id = $(selectedElement).attr('id');

                return new Promise(function (resolve) {
                    check();

                    function check() {
                        if (coverData.cover[id] && coverData.cover[id][source].url || coverData.cover[id] && coverData.cover[id][source].urlStatus === false) {
                            ++checked;
                        } else if (checked >= covers.length) {
                            resolve(checked);
                        } else {
                            setTimeout(check, checkTimeout);
                        }
                        displayProgress(element.children('a').children('.download-progress'), checked / covers.length * 100, status);
                    }
                });
            }
        }
        function saveCovers(fn, button) {
            if (coverData.selected.length > 0 && !busyDownloading) {
                try {
                    coverUrlsCheck(button).then(function () {
                        try {
                            fn(button).then(function () {
                                if (config.revertCoversAfterSave) revertCovers();
                            });
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
        async function saveCoversAsJPEG() {
            busyDownloading = false;

            if (coverData.selected.length > config.saveAsJPEGConfirm && config.saveAsJPEGConfirm > 0) {
                if (confirm(`You are about to save more than ${config.saveAsJPEGConfirm} covers!`)) {
                    await coverData.selected.each(save);
                }
            } else {
                await coverData.selected.each(save);
            }

            function save(i, element) {
                const id = $(element).attr('id');
                const saveFileName = getFileName({id: id});

                displayProgress($(element).parent().children('.download-progress'), 0, 'Saving Cover...');
                readyToDownload().then(download);

                function download() {
                    if (config.imageSaveLocationCheck) {
                        GM_download({
                            url: coverData.cover[id].blob.coverUrl,
                            name: getFileName({
                                id: id,
                                string: config.imageSaveLocation,
                                filterName: false
                            }) + saveFileName,
                            saveAs: false,
                            onload: onLoad,
                            onabort: handleError,
                            onerror: handleError,
                            ontimeout: handleError
                        });

                        function onLoad() {
                            --concurrentDownloads.count;
                            displayProgress($(element).parent().children('.download-progress'), 100);
                        }
                    } else {
                        handleError();
                    }
                    function handleError() {
                        --concurrentDownloads.count;
                        try {
                            saveAs(coverData.cover[id].blob.url, saveFileName);
                        } catch (e) {
                            displayError(`${coverData.cover[id].title} ${saveFileName} ${coverData.cover[id].blob.url} ${e.message}`);
                        } finally {
                            displayProgress($(element).parent().children('.download-progress'), 100);
                        }
                    }
                }
            }
        }
        async function saveCoversAsZIP(button) {
            busyDownloading = true;
            const zip = new JSZip();

            coverData.selected.each(zipCover);

            await zip.generateAsync({type:'blob', streamFiles: true}, function updateCallback(metaconfig) {
                displayProgress(button.children('a').children('.download-progress'), metaconfig.percent, 'Zipping covers...');
            })
                .then(function callback(blob) {
                    busyDownloading = false;
                    const title = titleSection.replace(saveAsNameRegex, '');
                    const saveFileName = getFileName({
                        string: config.zipFileNameMask,
                        extension: 'zip'
                    });

                    try {
                        saveAs(blob, saveFileName);
                    } catch (e) {
                        displayError(`${title} ${saveFileName} ${e.message}`);
                    } finally {
                        displayProgress(button.children('a').children('.download-progress'), 100);
                    }
                });

            function zipCover(i, element) {
                const id = $(element).attr('id');
                const saveFileName = getFileName({id: id});

                zip.file(saveFileName, coverToPromise(id), {binary: true});
            }
            function coverToPromise(id) {
                return new Promise(function (resolve, reject) {
                    JSZipUtils.getBinaryContent(coverData.cover[id].blob.url, function (error, config) {
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
        async function copyCoverLinks() {
            busyDownloading = false;
            let links = '';
            coverData.selected.each((i, element) => {
                const id = $(element).attr('id');
                links += getFileName({
                    id: id,
                    string: config.clipboardMask,
                    filterName: false
                });
            });
            await GM_setClipboard(links);
        }
        function getFileName({
         id,
         string = config.imageFileNameMask,
         extension = coverData.extension,
         filterName = true
        }) {
            const masks = {
                seriesTitle: titleSection,
                fileExtension: extension
            }
            if (id) {
                masks.elementId = id;
                masks.volumeTitle = coverData.cover[id].title;
                masks.number = coverData.cover[id].number;
                masks.fileName = coverData.cover[id].blob.fileName;
                masks.fileNameId = coverData.cover[id].blob.fileNameId;
                masks.coverURL = coverData.cover[id].blob.coverUrl;
                masks.newLine = '\n';
            }

            let fileName = string
            $.each(masks, function (i, argument) {
                fileName = fileName.replaceAll(`%${i}%`, argument);
            })

            if (filterName) {
                fileName.replace(saveAsNameRegex, '');

                if (coverData.knownFileName[fileName] > -1) {
                    const extensionIndex = fileName.lastIndexOf(`.${extension}`);
                    fileName = `${fileName.substring(0, extensionIndex)}(${++coverData.knownFileName[fileName]})${fileName.substring(extensionIndex)}`;
                } else {
                    coverData.knownFileName[fileName] = 0;
                }
            }

            return fileName;
        }
        function selectAllCovers() {
            if (!busyDownloading) {
                if (buttonData.button.selectAll.status === buttonData.button.selectAll.text[1]) {
                    coverData.image.each((i, element) => selectCover($(element), false));
                } else if (buttonData.button.selectAll.status === buttonData.button.selectAll.text[0]) {
                    coverData.image.each((i, element) => selectCover($(element)));
                }
                coverData.lastSelected = undefined;
            }
        }
        function setSource(button) {
            if (!busyDownloading) {
                const selectedUrl = $('#bookwalker-cover-downloader-source-url-select').val();
                const selectedPage = $('#bookwalker-cover-downloader-source-page-select').val();
                if (
                    selectedUrl !== config.downloadSource
                    || config.downloadSource !== coverData.source[1] && selectedPage !== config.downloadPage
                ) {
                    promiseUrls().then(function () {
                        const selected = coverData.selected;
                        const lastSelected = coverData.lastSelected;
                        config.downloadSource = selectedUrl;
                        config.downloadPage = selectedPage;
                        revertCovers();
                        if (config.downloadOnLoad) downloadAll();
                        if (selected.length > 0) selected.each((i, element) => selectCover($(element)));
                        coverData.lastSelected = lastSelected;
                    });

                    async function promiseUrls() {
                        return await new Promise(function (resolve) {
                            if (config.downloadSource === coverData.source[0]) {
                                let checked = 0;
                                $.each(coverData.source, function (i, source) {
                                    if (source !== coverData.source[0]) {
                                        promiseUrl(source).then(function () {
                                            ++checked;
                                            if (checked >= coverData.source.length - 1) {
                                                if (coverData.selected.length > 0) {
                                                    promiseUrl('blob', coverData.selected).then(function () {
                                                        busyDownloading = false;
                                                        resolve(true);
                                                    });
                                                } else {
                                                    busyDownloading = false;
                                                    resolve(true);
                                                }
                                            }
                                        });
                                    }
                                });
                            } else promiseUrl(config.downloadSource).then(function () {
                                if (coverData.selected.length > 0) {
                                    promiseUrl('blob', coverData.selected).then(function () {
                                        busyDownloading = false;
                                        resolve(true);
                                    });
                                } else {
                                    busyDownloading = false;
                                    resolve(true);
                                }
                            });
                        });
                    }
                    async function promiseUrl(source, covers = coverData.image) {
                        return await new Promise(function (resolve) {
                            try {
                                coverUrlsCheck(button, covers, source, 'Please wait...').then(function () {
                                    resolve(true);
                                });
                            } catch (e) {
                                busyDownloading = false;
                                displayProgress(button.children('a').children('.download-progress'), 100);
                                displayError(e.message);
                            }
                        });
                    }
                }
            }
        }
        function revertCovers() {
            if (!busyDownloading) {
                coverData.image.each(function (i, element) {
                    const id = $(element).attr('id');

                    displayCover($(element), id, true);
                    selectCover($(element), false);
                    if (coverData.cover[id].blob.url) {
                        URL.revokeObjectURL(coverData.cover[id].blob.url);
                        delete coverData.cover[id].blob.url;
                    }
                    $.each(coverData.source, function (i, source) {
                        if (coverData.cover[id][source] && coverData.cover[id][source].url)
                            delete coverData.cover[id][source].url;
                    });
                    coverData.knownFileName = {};
                    if (!coverData.cover[id].selectable) {
                        coverData.cover[id].selectable = true;
                        ++coverData.selectable;
                    }
                    coverData.cover[id].clicked = false;
                    getCoverUrl(i, element);
                });
            }
        }
        function downloadAll() {
            coverData.image.each((i, element) => selectCover($(element)));
            coverData.image.each((i, element) => selectCover($(element), false));
            coverData.lastSelected = undefined;
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
                margin: 16px;
            }
            .bookwalker-cover-downloader#bookwalker-cover-downloader-errors > p {
                border: solid red 1px;
                border-radius: 4px;
                margin: 2px;
            }
            img.bookwalker-cover-downloader {
                opacity: 0.5;
            }
            img.bookwalker-cover-downloader.cover-selected {
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
                z-index: 100;
                overflow: hidden;
                white-space: nowrap;
                border-radius: 4px;
            }
            .bookwalker-cover-downloader.cover-data p {
                margin: 0.16rem;
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
            #bookwalker-cover-downloader-source-select select {
                color: #fff;
                cursor: pointer;
                padding: 13px 12px;
                border: unset;
                border-radius: 4px;
            }
        `);
    }
})();
