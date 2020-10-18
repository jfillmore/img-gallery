'use strict';

/* TODO:

- swipe down on thumbnails = close
- storage for comments
- loaded class for thumbnails/footer

*/

(function () {
    var UI,
        GalleryItem;

    GalleryItem = function (section, index) {
        var item = UI.galleries[section][index];
        return {
            section: section,
            files: item.files,
            name: item.name,
            index: index,
            getImage: function (imgType) {
                var i;
                for (i = 0; i < item.files.length; i++) {
                    if (item.files[i].sizeName == imgType) {
                        return item.files[i];
                    }
                }
            }
        };
    };
    GalleryItem.IMAGE_LARGE = 'large';
    GalleryItem.IMAGE_SMALL = 'small';
    GalleryItem.IMAGE_TINY = 'tiny';

    UI = {
        // main vars
        autoplay: false,
        autoplayTimer: 6000,
        autoplayLastTick: null, // ensures repeated off/off ignores old ticks
        touchXy: [], // coords for last touch start
        numThumbnails: 10,
        $els: {}, // managed by $cache
        galleries: {}, // section > [urls]
        // which part of the gallery is currently active?
        section: undefined,
        // where in the gallery are we currently viewing?
        index: 0,
        // while browsing the thumbnails, what is our current position?
        indexThumbnails: 0,

        // merge two (or more) objects together without modifying any parameters
        mergeObjs: function () {
            var merged = {}, i, name, addonObj;
            for (i = 0; i < arguments.length && arguments[i]; i++) {
                addonObj = arguments[i];
                for (name in addonObj) {
                    if (addonObj.hasOwnProperty(name)) {
                        merged[name] = addonObj[name];
                    }
                }
            }
            return merged;
        },

        // get arguments based on a set of defaults, optionally allowing extra args in
        getArgs: function (baseArgs, args, merge) {
            var arg,
                finalArgs = UI.mergeObjs({}, baseArgs);
            for (arg in args) {
                if (args.hasOwnProperty(arg) && args[arg] !== undefined) {
                    if (arg in baseArgs || merge) {
                        finalArgs[arg] = args[arg];
                    }
                }
            }
            return finalArgs;
        },

        $cache: function (query, name, args) {
            var els = UI.$(query);
            args = UI.getArgs({
                single: false,
                mapBy: undefined // function to extract element string value
            }, args);
            if (args.single && args.mapBy) {
                throw new Error("Cannot use 'single' and 'mapBy' together; options conflict");
            }
            if (els.length < 1) {
                throw new Error("Failed to find at least one element matching '" + query + "'");
            }
            if (args.single) {
                UI.$els[name] = els[0];
            } else {
                // if fetching multiple objects we can either generate an object or array
                if (args.mapBy) {
                    if (!UI.$els.hasOwnProperty(name)) {
                        UI.$els[name] = {};
                    }
                    els.forEach(function (el) {
                        var mappedName = args.mapBy(el, name, els);
                        UI.$els[name][mappedName] = el;
                    });
                } else {
                    UI.$els[name] = els;
                }
            }
            return UI.$els[name];
        },

        // querySelectorAll shorthand
        $: function (query, el) {
            if (el === undefined) {
                el = document;
            }
            return el.querySelectorAll(query);
        },

        // querySelector shorthand
        $1: function (query, el) {
            if (el === undefined) {
                el = document;
            }
            return el.querySelector(query);
        },

        // get a bunch of items, before and after the section/index given and scrolling into other galleries if needed
        getGalleryItems: function (section, index, count, leftCount) {
            var galleryItems = [],
                gallery = UI.galleries[section],
                galleryItem,
                pos,
                i;
            // we start with the current gallery given and get a slice of
            // items before and after; if we run out of images we'll go to the
            // previous/next galleries, but avoid using the same gallery twice
            count = count || 1;
            // ensure our starting point is constrained to the current gallery
            if (index < 0) {
                index = Math.max(gallery.length + index, 0);
            } else {
                index = index % gallery.length;
            }
            galleryItems.push(GalleryItem(section, index)); // we'll keep the current index in the middle of previous vs next
            // now figure out the before/after items
            for (i = 1; i <= count; i++) {
                // prev
                if (!leftCount || leftCount && i <= leftCount) {
                    pos = index - i;
                    if (pos >= 0) {
                        galleryItems.unshift(GalleryItem(section, pos));
                    } else {
                        // look in previous galleries
                        galleryItem = UI.scrollGallery(
                            section,
                            UI.prevSection(),
                            pos, // e.g. -1, -10
                            true
                        );
                        if (galleryItem) {
                            galleryItems.unshift(galleryItem);
                        }
                    }
                }
                // next
                pos = index + i;
                if (pos < gallery.length) {
                    galleryItems.push(GalleryItem(section, pos));
                } else {
                    // look in the upcoming galleries
                    galleryItem = UI.scrollGallery(
                        section,
                        UI.nextSection(),
                        pos - gallery.length, // e.g. 0, 20
                    );
                    if (galleryItem) {
                        galleryItems.push(galleryItem);
                    }
                }
            }
            return galleryItems;
        },

        // attempts to get a gallery item from a prev/next section, scrolling through multiple if needed but stopping if we reach our current gallery
        scrollGallery: function (startSection, section, index, scrollBack) {
            var gallery;
            if (index < 0 && !scrollBack) {
                throw new Error("Overflow index must be positive to go forward.");
            } else if (index > 0 && scrollBack) {
                throw new Error("Overflow index must be negative to go back.");
            }
            // we never want to return back to the start
            while (section != startSection) {
                // we MAY not find the image in this gallery...
                gallery = UI.galleries[section];
                if (scrollBack) {
                    // e.g. -2 and gallery.length = 10 (found it!)
                    //  or: -5 and gallery.length = 3 (keep going)
                    index = gallery.length + index;
                }
                // see if we need to keep iterating or not
                if (index < 0) {
                    section = UI.prevSection();
                } else if (index >= gallery.length) {
                    // e.g. 2 and gallery.length = 10 (found it!)
                    //  or: 5 and gallery.length = 3 (keep going)
                    section = UI.nextSection();
                    index -= gallery.length;
                } else {
                    return GalleryItem(section, index);
                }
            }
        },

        initImgBehaviors: function () {
            var curImg = UI.$1('img[data-item-pos="current"]', UI.$els.gallery);
            curImg.addEventListener('click', UI.nextImg);
            UI.$('img', UI.$els.footerNav).forEach(function (img) {
                img.addEventListener('click', function () {
                    UI.navTo(
                        this.getAttribute('data-gallery'),
                        parseInt(this.getAttribute('data-index'), 10)
                    );
                });
            });
        },

        initThumbnailBehaviors: function () {
            UI.$('img', UI.$els.thumbnailsBrowser).forEach(function (img) {
                img.addEventListener('click', function () {
                    UI.navTo(
                        this.getAttribute('data-gallery'),
                        parseInt(this.getAttribute('data-index'), 10)
                    );
                });
            });
        },

        // show a generic error
        error: function () {
            // TODO
        },

        autoplayStart: function () {
            UI.autoplay = true;
            UI.$els.autoplayStart.style.display = 'none';
            UI.$els.autoplayStop.style.display = 'block';
            UI.$els.footer.style.display = 'none';
            UI.hideControls();
            UI.autoplayLastTick = (new Date).getTime();
            UI.PlayTick(true);
            // ensure we show at the right size after the footer is hidden
            setTimeout(UI.FormatImgs, 300);
        },

        autoplayStop: function () {
            UI.autoplay = false;
            UI.$els.autoplayStart.style.display = 'block';
            UI.$els.autoplayStop.style.display = 'none';
            UI.$els.footer.style.display = 'block';
            UI.showControls();
            UI.autoplayLastTick = null;
            setTimeout(UI.FormatImgs, 300);
        },

        PlayTickCounter: function (nowMs) {
            if (!nowMs) {
                nowMs = (new Date).getTime();
            }
        },

        PlayTick: function (starting) {
            var nowMs = (new Date).getTime(),
                left = (UI.autoplayTimer - (nowMs - UI.autoplayLastTick)) / 1000;
            if (UI.autoplay) {
                UI.$els.autoplayCtr.innerHTML = '[' 
                    + parseInt(left + (starting ? 0 : 1) , 10) + ']';
                if (nowMs >= (UI.autoplayLastTick + UI.autoplayTimer)) {
                    UI.nextImg();
                    UI.autoplayLastTick = nowMs;
                }
                setTimeout(UI.PlayTick, 1000);
            }
        },

        TouchStart: function (ev) {
            UI.touchXy = [
                ev.touches[0].clientX,
                ev.touches[0].clientY,
            ];
        },

        TouchMove: function (ev) {
            var dx, dy, threshold = 66;
            if (!UI.touchXy.length) {
                return;
            }
            dx = UI.touchXy[0] - ev.touches[0].clientX;
            dy = UI.touchXy[1] - ev.touches[0].clientY;
            if (Math.abs(dx) > Math.abs(dy)) {
                if (Math.abs(dx) > threshold) {
                    UI.TouchGo(dx);
                }
            } else {
                if (dy > threshold) {
                    UI.showThumbnails();
                } else {
                }
            }
        },

        TouchGo: function (delta) {
            var go = function () {
                if (delta > 0) {
                    UI.nextImg();
                } else {
                    UI.prevImg();
                }
            };
            UI.touchXy = [];
            UI.$1('img[data-item-pos="current"]', UI.$els.gallery)
                .classList.add('swiped-' + (delta < 0 ? 'left' : 'right'));
            setTimeout(go, 600);
        },

        onHashchange: function () {
            var hash = window.location.hash,
                index = UI.index,
                section = UI.section;
            if (hash) {
                hash = hash.substr(1);
                hash.split('&').forEach(function (part) {
                    var pair = part.split('=');
                    if (pair[0] === 'i' && pair.length >=2 ) {
                        index = parseInt(pair[1], 10) - 1;
                    }
                    if (pair[0] === 's' && pair.length >=2 ) {
                        section = decodeURI(pair[1]);
                    }
                });
            }
            // always nav if on 0 (e.g. first page load)
            if (index !== UI.index || !index) {
                UI.navTo(section, index);
            };
        },

        // load up a particular section of the gallery
        navTo: function (section, index) {
            var part;
            // default to the first part of the gallery
            if (!section) {
                for (part in UI.galleries) {
                    if (UI.galleries.hasOwnProperty(part)) {
                        section = part;
                        break
                    }
                }
            }
            // default to first if not found
            if (!UI.galleries.hasOwnProperty(section)) {
                UI.navTo();
                return;
            }
            UI.section = section;
            UI.loadImgs(index === undefined ? 0 : index);
        },

        hideControls: function () {
            UI.$('.nav-control', UI.$els.content).forEach(function (el) {
                el.classList.add('hidden');
            });
        },

        showControls: function () {
            UI.$('.nav-control', UI.$els.content).forEach(function (el) {
                el.classList.remove('hidden');
            });
        },

        showSections: function () {
            UI.hideControls();
            UI.$els.sections.classList.remove('hidden');
        },

        hideSections: function () {
            if (!UI.autoplay) {
                UI.showControls();
            }
            UI.$els.sections.classList.add('hidden');
        },

        showThumbnails: function () {
            UI.hideControls();
            UI.$els.thumbnails.classList.remove('hidden');
        },

        hideThumbnails: function () {
            if (!UI.autoplay) {
                UI.showControls();
            }
            UI.$els.thumbnails.classList.add('hidden');
        },

        renderImages: function (galleryItems, size) {
            var html = [],
                seenCurrentItem = false,
                seenCurrentGallery = false;
            size = size || GalleryItem.IMAGE_TINY;
            galleryItems.forEach(function (galleryItem) {
                var itemPosition,
                    galleryPosition,
                    isCurrentGallery = (
                        UI.section == galleryItem.section 
                    ),
                    isCurrentItem = (
                        galleryItem.index === UI.index
                        && isCurrentGallery
                    );
                if (isCurrentGallery) {
                    seenCurrentGallery = true;
                    galleryPosition = 'current';
                } else {
                    galleryPosition = seenCurrentGallery ? 'next' : 'prev';
                }
                if (isCurrentItem) {
                    seenCurrentItem = true;
                    itemPosition = 'current';
                } else {
                    itemPosition = seenCurrentItem ? 'next' : 'prev';
                }
                html.push(
                    '<img src="' + galleryItem.getImage(size).src + '"'
                    + ' data-index="' + galleryItem.index + '"'
                    + ' data-gallery="' + galleryItem.section + '"'
                    + ' data-gallery-pos="' + galleryPosition + '"'
                    + ' data-item-pos="' + itemPosition + '"'
                    + '>'
                );
            });
            return html.join('\n');
        },

        loadFooterImgs: function (index) {
            UI.$els.footerNav.innerHTML = UI.renderImages(
                UI.getGalleryItems(UI.section, index, 9, 2)
            );
        },

        // load thumbnails for the current section; shows `UI.numThumbnails` before and after the index given
        loadThumbnailImgs: function (index) {
            UI.$els.thumbnailsBrowser.innerHTML = UI.renderImages(
                UI.getGalleryItems(UI.section, index, UI.numThumbnails)
            );
            UI.indexThumbnails = index;
            UI.initThumbnailBehaviors();
        },

        // load all sections from the gallery
        loadSections: function () {
            var html,
                section;
            html = ['<ol>'];
            for (section in UI.galleries) {
                if (UI.galleries.hasOwnProperty(section)) {
                    html.push(
                        '<li class="'
                        + (UI.section == section ? 'active' : '')
                        + '">' + section
                        + '</li>'
                    );
                }
            }
            html.push('</ol>');
            UI.$1('.browser', UI.$els.sections).innerHTML = html.join('\n');
            UI.$('li', UI.$els.sections).forEach(function (el) {
                el.addEventListener('click', function (ev) {
                    UI.navTo(ev.target.textContent, 0);
                    UI.hideSections();
                });
            });
        },

        nextSection: function () {
            var section, prev, first;
            for (section in UI.galleries) {
                if (UI.galleries.hasOwnProperty(section)) {
                    if (!first) {
                        first = section;
                    }
                    if (prev == UI.section) {
                        return section;
                    }
                    prev = section;
                }
            }
            return first;
        },

        prevSection: function () {
            var section, prev, last;
            for (section in UI.galleries) {
                if (UI.galleries.hasOwnProperty(section)) {
                    if (section == UI.section && prev) {
                        return prev;
                    }
                    prev = section;
                    last = section;
                }
            }
            return last;
        },

        // load images into the main content and thumbnail gallery
        loadImgs: function (index) {
            var i, prev, next,
                toPreload = [],
                html = [],
                section = UI.section,
                gallery = UI.galleries[section],
                galleryItems;

            UI.hideThumbnails();
            // ensure the requested index is within the gallery
            if (index === undefined) {
                index = UI.index || 0;
            } else if (index < 0) {
                UI.navTo(UI.prevSection());
                section = UI.section;
                gallery = UI.galleries[UI.section];
                index = gallery.length - 1;
            } else if (index >= gallery.length) {
                UI.navTo(UI.nextSection());
                section = UI.section;
                gallery = UI.galleries[UI.section];
                index = 0;
            }
            UI.index = index;
            UI.indexThumbnails = index;
            // anytime we change images, reset the autoplay timer
            UI.autoplayLastTick = (new Date).getTime();
            // load a few at a time so we have at least a few preloading
            UI.$els.gallery.innerHTML = UI.renderImages(
                UI.getGalleryItems(section, index, 2),
                GalleryItem.IMAGE_LARGE
            );
            // generate quick preview thumbnails in the footer
            UI.loadFooterImgs(index);
            // and also a bunch in the thumbnail browser
            UI.loadThumbnailImgs(index);
            // set sizing/click behaviors
            UI.$els.gallery.querySelectorAll('img[data-item-pos]').forEach(function (img) {
                UI.FormatImg(img);
            });
            UI.initImgBehaviors();
            UI.updateHeader(gallery[index].name);
        },

        nextImg: function () {
            UI.loadImgs(UI.index + 1);
        },

        prevImg: function () {
            UI.loadImgs(UI.index - 1);
        },

        FormatImgs: function () {
            var imgs = UI.$('img', UI.$els.gallery), i;
            for (i = 0; i < imgs.length; i++) {
                UI.FormatImg(imgs[i]);
            }
        },

        FormatImg: function (img) {
            var margin, parentElStyle, bounds, extraX, extraY, boundX, boundY,
                ratio, imgX, imgY, newStyle, dim,
                key, newX, newY;
            if (!img.complete) {
                img.addEventListener('load',  function () {
                    UI.FormatImg(img);
                });
                return
            }
            // get our bounding box
            if (!img.parentElement) {
                // wait until we're ready though!
                setTimeout(function () {
                    UI.FormatImg(img);
                }, 100);
                return;
            }
            bounds = img.parentElement.getBoundingClientRect()
            parentElStyle = window.getComputedStyle(img.parentElement);
            boundY = bounds.height - (
                (parseInt(parentElStyle.paddingTop, 10) || 0)
                + (parseInt(parentElStyle.paddingBottom, 10) || 0)
                + (parseInt(parentElStyle.marginTop, 10) || 0)
                + (parseInt(parentElStyle.marginBottom, 10) || 0)
            );
            boundX = bounds.width - (
                (parseInt(parentElStyle.paddingLeft, 10) || 0)
                + (parseInt(parentElStyle.paddingRight, 10) || 0)
                + (parseInt(parentElStyle.margingLeft, 10) || 0)
                + (parseInt(parentElStyle.margingRight, 10) || 0)
            );
            // figoure out our dimensions
            // always calc based on our original attributes; set 'em on first load
            imgX = parseInt(img.getAttribute('data-x'), 10);
            imgY = parseInt(img.getAttribute('data-y'), 10);
            if (!imgX) {
                imgX = img.width;
                img.setAttribute('data-x', imgX);
            }
            if (!imgY) {
                imgY = img.height;
                img.setAttribute('data-y', imgY);
            }
            // if we're rotated on our side, we have to swap X/Y vals
            dim = {
                X: 'width',
                Y: 'height',
                mX: 'marginTop',
                mX2: 'marginBottom',
                mY: 'marginLeft',
                mY2: 'marginRight',
            }
            // whichever side protrudes more, percentage wise, if any, sets our ratio
            extraY = (imgY - boundY) / imgY;
            extraX = (imgX - boundX) / imgX;
            newStyle = {};
            ratio = imgX / imgY;  // e.g. 1.5 = wide, .666 = tall
            if (extraX || extraY) {
                if (extraY > extraX) {
                    // we're taller rather than wider
                    newStyle[dim.Y] = boundY + 'px';
                    newStyle[dim.X] = (imgX * (boundY / imgY)) + 'px';
                } else {
                    // wider than we are tall
                    newStyle[dim.X] = boundX + 'px';
                    newStyle[dim.Y] = (imgY * (boundX / imgX)) + 'px';
                }
            } else {
                // not bound by either side, so just center it full-size
                newStyle[dim.X] = (imgX) + 'px';
                newStyle[dim.Y] = (imgY) + 'px';
            }
            newX = parseInt(newStyle[dim.X], 10);
            newY = parseInt(newStyle[dim.Y], 10);
            // black magic warning
            newStyle[dim.mX] = (Math.max(0, boundY - newY) / 2) + 'px';
            newStyle[dim.mY] = (Math.max(0, boundX - newX) / 2) + 'px';
            newStyle[dim.mX2] = 'auto';
            newStyle[dim.mY2] = 'auto';
            // apply styling and flag as loaded for final CSS
            for (key in newStyle) {
                img.style[key] = newStyle[key];
            }
            img.classList.add('loaded');
        },

        FormatLoc: function (index, section, imgName) {
            var html;
            if (section) {
                html = '<strong>' + index + '. ' + section + '</strong>';
            } else {
                html = '<strong>' + index + '.</strong>';
            }
            if (imgName) {
                imgName = imgName.split('/');
                imgName = imgName[imgName.length - 1];
                html += ' - ' + imgName;
            }
            html += ' (' + (UI.index + 1) + ' of ' + UI.galleries[section].length + ')';
            return html;
        },

        updateHeader: function (imgName) {
            var i = 0, locIndex, loc, prevLoc, nextLoc;
            for (loc in UI.galleries) {
                if (UI.galleries.hasOwnProperty(loc)) {
                    i += 1;
                    if (loc === UI.section) {
                        locIndex = i;
                        UI.$els.section.innerHTML = UI.FormatLoc(i, loc);
                    } else if (i !== 0 && locIndex === undefined) {
                        prevLoc = loc;
                    } else if (locIndex !== undefined) {
                        nextLoc = loc;
                        break;
                    }
                }
            }
            window.location.hash = '#' + [
                'i=' + (UI.index + 1),
                's=' + encodeURI(UI.section)
            ].join('&');
        },

        init: function () {
            // fetch images.json and generate gallery information
            var loc;
            var xhr = new XMLHttpRequest();
            UI.initEls();
            UI.initBehaviors();
            xhr.open('GET', './images.json', true);
            xhr.onload = function () {
                var images, i, item, loc, navPath;
                if (this.status >= 200 && this.status < 300) {
                    images = JSON.parse(this.response).images;
                    for (i = 0; i < images.length; i++) {
                        navPath = images[i].name.split('/');
                        loc = navPath.slice(0, -1).join('/');
                        if (!UI.galleries.hasOwnProperty(loc)) {
                            UI.galleries[loc] = [];
                        }
                        UI.galleries[loc].push(images[i]);
                    }
                    UI.onInit();
                } else {
                    UI.error();
                }
            }
            xhr.onerror = function () {
                UI.error();
            }
            xhr.send();
        },

        // cache UI parts
        initEls: function () {
            UI.$cache('#content', 'content', {single: true});
            UI.$cache('#content .images', 'gallery', {single: true});
            UI.$cache('#content .nav-next', 'navNext', {single: true});
            UI.$cache('#content .nav-prev', 'navPrev', {single: true});
            UI.$cache('#sections', 'sections', {single: true});
            UI.$cache('#sections .browser', 'sectionsBrowser', {single: true});
            UI.$cache('#sections .controls', 'sectionsControls', {single: true});
            UI.$cache('#thumbnails', 'thumbnails', {single: true});
            UI.$cache('#thumbnails .browser', 'thumbnailsBrowser', {single: true});
            UI.$cache('#thumbnails .controls', 'thumbnailsControls', {single: true});
            UI.$cache('#footer', 'footer', {single: true});
            UI.$cache('#footer .images', 'footerNav', {single: true});
            UI.$cache('#content .nav-next', 'nextImage', {single: true});
            UI.$cache('#content .nav-prev', 'prevImage', {single: true});
            UI.$cache('#header .section', 'section', {single: true});
            UI.$cache('#header .auto-play .start', 'autoplayStart', {single: true});
            UI.$cache('#header .auto-play .stop', 'autoplayStop', {single: true});
            UI.$cache('#header .auto-play .auto-play-ctr', 'autoplayCtr', {single: true});
        },

        // setup some general bindings
        initBehaviors: function () {
            UI.$els.section.addEventListener('click', UI.showSections);
            UI.$els.autoplayStart.addEventListener('click', UI.autoplayStart);
            UI.$els.autoplayStop.addEventListener('click', UI.autoplayStop);
            UI.$els.navNext.addEventListener('click', UI.nextImg);
            UI.$els.navPrev.addEventListener('click', UI.prevImg);
            UI.$els.content.addEventListener('click', UI.hideThumbnails);
            UI.$1('.close', UI.$els.sectionsControls)
                .addEventListener('click', UI.hideSections);
            UI.$1('.close', UI.$els.thumbnailsControls)
                .addEventListener('click', UI.hideThumbnails);
            UI.$1('.page-prev', UI.$els.thumbnailsControls)
                .addEventListener('click', function () {
                    UI.loadThumbnailImgs(UI.indexThumbnails - (UI.numThumbnails * 2) - 1);
                });
            UI.$1('.page-next', UI.$els.thumbnailsControls)
                .addEventListener('click', function () {
                    UI.loadThumbnailImgs(UI.indexThumbnails + (UI.numThumbnails * 2) + 1);
                });
            UI.$1('.nav-thmb', UI.$els.content).addEventListener('click', function (el) {
                UI.showThumbnails();
                el.stopPropagation();
            });
            UI.$els.content.addEventListener('touchstart', UI.TouchStart, {passive: true});
            UI.$els.content.addEventListener('touchmove', UI.TouchMove, {passive: true});
            window.addEventListener('hashchange', UI.onHashchange);
            window.addEventListener('resize', UI.FormatImgs);
            document.body.addEventListener('keyup', function (ev) {
                // back/forward on left-right keyboard buttons
                // up/down to show/hide thumbnails and section browser
                var keyCode = {
                    left: 37,
                    up: 38,
                    right: 39,
                    down: 40
                };
                if (ev.keyCode === keyCode.left) {
                    UI.prevImg();
                } else if (ev.keyCode === keyCode.up) {
                    if (UI.$els.sections.classList.contains('hidden')) {
                        UI.showThumbnails();
                    } else {
                        UI.hideSections();
                    }
                } else if (ev.keyCode === keyCode.right) {
                    UI.nextImg();
                } else if (ev.keyCode === keyCode.down) {
                    if (UI.$els.thumbnails.classList.contains('hidden')) {
                        UI.showSections();
                    } else {
                        UI.hideThumbnails();
                    }
                }
            });
        },

        onInit: function () {
            // and get it rollin'!
            UI.onHashchange();
            // load this last so we know which section is selected
            UI.loadSections();
        }
    };

    UI.init();
    window.UI = UI;

})();
