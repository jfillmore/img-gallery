'use strict';

/* TODO:

- swipe down on thumbnails = close
- JSON storage for comments
- loaded class for thumbnails/footer
*/

(function () {
    var UI = {
        // main vars
        autoplay: false,
        autoplay_timer: 8000,
        autoplay_last_tick: null, // ensures repeated off/off ignores old ticks
        touch_xy: [], // coords for last touch start
        num_thumbnails: 10,
        $els: {}, // managed by $cache
        gallery: {}, // section > [urls]
        section: undefined,
        index: 0,
        index_thumbnails: 0,

        // merge two (or more) objects together without modifying any parameters
        merge_objs: function () {
            var merged = {}, i, name, addon_obj;
            for (i = 0; i < arguments.length && arguments[i]; i++) {
                addon_obj = arguments[i];
                for (name in addon_obj) {
                    if (addon_obj.hasOwnProperty(name)) {
                        merged[name] = addon_obj[name];
                    }
                }
            }
            return merged;
        },

        // get arguments based on a set of defaults, optionally allowing extra args in
        get_args: function (base_args, args, merge) {
            var arg,
                final_args = UI.merge_objs({}, base_args);
            for (arg in args) {
                if (args.hasOwnProperty(arg) && args[arg] !== undefined) {
                    if (arg in base_args || merge) {
                        final_args[arg] = args[arg];
                    }
                }
            }
            return final_args;
        },

        $cache: function (query, name, args) {
            var els = UI.$(query);
            args = UI.get_args({
                single: false,
                map_by: undefined // function to extract element string value
            }, args);
            if (args.single && args.map_by) {
                throw new Error("Cannot use 'single' and 'map_by' together; options conflict");
            }
            if (els.length < 1) {
                throw new Error("Failed to find at least one element matching '" + query + "'");
            }
            if (args.single) {
                UI.$els[name] = els[0];
            } else {
                // if fetching multiple objects we can either generate an object or array
                if (args.map_by) {
                    if (!UI.$els.hasOwnProperty(name)) {
                        UI.$els[name] = {};
                    }
                    els.forEach(function (el) {
                        var mapped_name = args.map_by(el, name, els);
                        UI.$els[name][mapped_name] = el;
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

        // get wrapping indices for any given index
        get_indices: function (gallery, index, count, left_count) {
            var indices = [],
                pos,
                i;
            count = count || 1;
            if (index < 0) {
                index = Math.max(gallery.length + index, 0);
            } else {
                index = index % gallery.length;
            }
            indices.push(index); // we'll keep this value in the middle
            for (i = 1; i <= count; i++)  {
                // prev
                if (!left_count || left_count && i <= left_count) {
                    pos = index - i;
                    if (pos < 0) {
                        pos = Math.max(0, gallery.length + pos);
                    }
                    indices.unshift(pos);
                }
                // next
                pos = index + i;
                if (pos >= gallery.length) {
                    pos = pos % gallery.length;
                }
                indices.push(pos);
            }
            return indices;
        },

        init_img_behaviors: function () {
            var cur_img = UI.$1('img[data-position="current"]', UI.$els.gallery);
            cur_img.addEventListener('click', UI.next_img);
            UI.$('img', UI.$els.footer_nav).forEach(function (img) {
                img.addEventListener('click', function () {
                    UI.nav_to(UI.section, parseInt(this.getAttribute('data-index'), 10));
                });
            });
        },

        init_thumbnail_behaviors: function () {
            UI.$('img', UI.$els.thumbnails_browser).forEach(function (img) {
                img.addEventListener('click', function () {
                    UI.nav_to(UI.section, parseInt(this.getAttribute('data-index'), 10));
                });
            });
        },

        // show a generic error
        error: function () {
            // TODO
        },

        autoplay_start: function () {
            UI.autoplay = true;
            UI.$els.autoplay_start.style.display = 'none';
            UI.$els.autoplay_stop.style.display = 'block';
            UI.$els.footer.style.display = 'none';
            UI.hide_controls();
            UI.autoplay_last_tick = (new Date).getTime();
            UI._play_tick(true);
            // ensure we show at the right size after the footer is hidden
            setTimeout(UI._format_imgs, 300);
        },

        autoplay_stop: function () {
            UI.autoplay = false;
            UI.$els.autoplay_start.style.display = 'block';
            UI.$els.autoplay_stop.style.display = 'none';
            UI.$els.footer.style.display = 'block';
            UI.show_controls();
            UI.autoplay_last_tick = null;
            setTimeout(UI._format_imgs, 300);
        },

        _play_tick_counter: function (now_ms) {
            if (!now_ms) {
                now_ms = (new Date).getTime();
            }
        },

        _play_tick: function (starting) {
            var now_ms = (new Date).getTime(),
                left = (UI.autoplay_timer - (now_ms - UI.autoplay_last_tick)) / 1000;
            if (UI.autoplay) {
                UI.$els.autoplay_ctr.innerHTML = '[' 
                    + parseInt(left + (starting ? 0 : 1) , 10) + ']';
                if (now_ms >= (UI.autoplay_last_tick + UI.autoplay_timer)) {
                    UI.next_img();
                    UI.autoplay_last_tick = now_ms;
                }
                setTimeout(UI._play_tick, 1000);
            }
        },

        _touch_start: function (ev) {
            UI.touch_xy = [
                ev.touches[0].clientX,
                ev.touches[0].clientY,
            ];
        },

        _touch_move: function (ev) {
            var dx, dy, threshold = 66;
            if (!UI.touch_xy.length) {
                return;
            }
            dx = UI.touch_xy[0] - ev.touches[0].clientX;
            dy = UI.touch_xy[1] - ev.touches[0].clientY;
            if (Math.abs(dx) > Math.abs(dy)) {
                if (Math.abs(dx) > threshold) {
                    UI._touch_go(dx);
                }
            } else {
                if (dy > threshold) {
                    UI.show_thumbnails();
                } else {
                }
            }
        },

        _touch_go: function (delta) {
            var go = function () {
                if (delta > 0) {
                    UI.next_img();
                } else {
                    UI.prev_img();
                }
            };
            UI.touch_xy = [];
            UI.$1('img[data-position="current"]', UI.$els.gallery)
                .classList.add('swiped-' + (delta < 0 ? 'left' : 'right'));
            setTimeout(go, 600);
        },

        on_hashchange: function () {
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
                });
            }
            // always nav if on 0 (e.g. first page load)
            if (index !== UI.index || !index) {
                UI.nav_to(section, index);
            };
        },

        // load up a particular section of the gallery
        nav_to: function (section, index) {
            var part;
            if (!section) {
                for (part in UI.gallery) {
                    if (UI.gallery.hasOwnProperty(part)) {
                        section = part;
                        break
                    }
                }
            }
            UI.section = section;
            UI.load_imgs(index);
        },

        hide_controls: function () {
            UI.$('.nav-control', UI.$els.content).forEach(function (el) {
                el.classList.add('hidden');
            });
        },

        show_controls: function () {
            UI.$('.nav-control', UI.$els.content).forEach(function (el) {
                el.classList.remove('hidden');
            });
        },

        show_thumbnails: function () {
            UI.hide_controls();
            UI.$els.thumbnails.classList.remove('hidden');
        },

        hide_thumbnails: function () {
            UI.show_controls();
            UI.$els.thumbnails.classList.add('hidden');
        },
        
        load_footer_imgs: function (index) {
            var html,
                section = UI.section,
                gallery = UI.gallery[section];
            html = [];
            UI.get_indices(gallery, index, 9, 2).forEach(function (i) {
                var last = gallery[i].files.length - 1;
                html.push(
                    '<img src="' + gallery[i].files[last].src + '"'
                    + ' data-index="' + i + '"'
                    + ((html.length === 0 || html.length === 10) ? ' data-preload' : '')
                    + (i < index ? ' data-past' : '')
                    + (i > index ? ' data-future' : '')
                    + (i === index ? ' data-current' : '') + '>'
                );
            });
            UI.$els.footer_nav.innerHTML = html.join('\n');
        },

        load_thumbnail_imgs: function (index) {
            var html,
                section = UI.section,
                gallery = UI.gallery[section];
            html = [];
            UI.get_indices(gallery, index, UI.num_thumbnails).forEach(function (i) {
                var last = gallery[i].files.length - 1;
                html.push(
                    '<img src="' + gallery[i].files[last].src + '"'
                    + ' data-index="' + i + '"'
                    + (i < UI.index ? ' data-past' : '')
                    + (i > UI.index ? ' data-future' : '')
                    + (i === UI.index ? ' data-current' : '') + '>'
                );
            });
            UI.$els.thumbnails_browser.innerHTML = html.join('\n');
            UI.index_thumbnails = index;
            UI.init_thumbnail_behaviors();
        },

        // load images into the main content and thumbnail gallery
        load_imgs: function (index) {
            var i, prev, next,
                to_preload = [],
                html = [],
                section = UI.section,
                gallery = UI.gallery[section],
                indices;

            UI.hide_thumbnails();
            // ensure the requested index is within the gallery
            if (index === undefined) {
                index = UI.index || 0;
            } else if (index < 0) {
                index = Math.max(gallery.length + index, 0);
            } else {
                index = index % gallery.length;
            }
            indices = UI.get_indices(gallery, index, 2);
            UI.index = index;
            UI.index_thumbnails = index;
            // anytime we change images, reset the autoplay timer
            UI.autoplay_last_tick = (new Date).getTime();
            // load a few at a time so we have at least a few preloading
            to_preload.push(indices[0]);
            to_preload.push(indices[4]);
            html.push('<img src="' + gallery[indices[1]].files[0].src + '" data-position="prev">');
            html.push('<img src="' + gallery[indices[2]].files[0].src + '" data-position="current" ' 
                + ' data-prev="' + indices[1] + '" data-next="' + indices[3] + '">');
            html.push('<img src="' + gallery[indices[3]].files[0].src + '" data-position="next">');
            to_preload.forEach(function (index) {
                html.push('<img src="' + gallery[index].files[0].src + '">');
            });
            UI.$els.gallery.innerHTML = html.join('\n');
            // generate quick preview thumbnails in the footer
            UI.load_footer_imgs(index);
            // and also a bunch in the thumbnail browser
            UI.load_thumbnail_imgs(index);
            // set sizing/click behaviors
            UI.$els.gallery.querySelectorAll('img[data-position]').forEach(function (img) {
                UI._format_img(img);
            });
            UI.init_img_behaviors();
            UI.update_header(gallery[index].name);
        },

        next_img: function () {
            UI.load_imgs(UI.index + 1);
        },

        prev_img: function () {
            UI.load_imgs(UI.index - 1);
        },

        _format_imgs: function () {
            var imgs = UI.$('img', UI.$els.gallery), i;
            for (i = 0; i < imgs.length; i++) {
                UI._format_img(imgs[i]);
            }
        },

        _format_img: function (img) {
            var margin, p_el_style, bounds, extra_x, extra_y, bound_x, bound_y,
                ratio, img_x, img_y, new_style, dim,
                key, new_x, new_y;
            if (!img.complete) {
                img.addEventListener('load',  function () {
                    UI._format_img(img);
                });
                return
            }
            // get our bounding box
            bounds = img.parentElement.getBoundingClientRect()
            p_el_style = window.getComputedStyle(img.parentElement);
            bound_y = bounds.height - (
                (parseInt(p_el_style.paddingTop, 10) || 0)
                + (parseInt(p_el_style.paddingBottom, 10) || 0)
                + (parseInt(p_el_style.marginTop, 10) || 0)
                + (parseInt(p_el_style.marginBottom, 10) || 0)
            );
            bound_x = bounds.width - (
                (parseInt(p_el_style.paddingLeft, 10) || 0)
                + (parseInt(p_el_style.paddingRight, 10) || 0)
                + (parseInt(p_el_style.margingLeft, 10) || 0)
                + (parseInt(p_el_style.margingRight, 10) || 0)
            );
            // figoure out our dimensions
            // always calc based on our original attributes; set 'em on first load
            img_x = parseInt(img.getAttribute('data-x'), 10);
            img_y = parseInt(img.getAttribute('data-y'), 10);
            if (!img_x) {
                img_x = img.width;
                img.setAttribute('data-x', img_x);
            }
            if (!img_y) {
                img_y = img.height;
                img.setAttribute('data-y', img_y);
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
            extra_y = (img_y - bound_y) / img_y;
            extra_x = (img_x - bound_x) / img_x;
            new_style = {};
            ratio = img_x / img_y;  // e.g. 1.5 = wide, .666 = tall
            if (extra_x || extra_y) {
                if (extra_y > extra_x) {
                    // we're taller rather than wider
                    new_style[dim.Y] = bound_y + 'px';
                    new_style[dim.X] = (img_x * (bound_y / img_y)) + 'px';
                } else {
                    // wider than we are tall
                    new_style[dim.X] = bound_x + 'px';
                    new_style[dim.Y] = (img_y * (bound_x / img_x)) + 'px';
                }
            } else {
                // not bound by either side, so just center it full-size
                new_style[dim.X] = (img_x) + 'px';
                new_style[dim.Y] = (img_y) + 'px';
            }
            new_x = parseInt(new_style[dim.X], 10);
            new_y = parseInt(new_style[dim.Y], 10);
            // black magic warning
            new_style[dim.mX] = (Math.max(0, bound_y - new_y) / 2) + 'px';
            new_style[dim.mY] = (Math.max(0, bound_x - new_x) / 2) + 'px';
            new_style[dim.mX2] = 'auto';
            new_style[dim.mY2] = 'auto';
            // apply styling and flag as loaded for final CSS
            for (key in new_style) {
                img.style[key] = new_style[key];
            }
            img.classList.add('loaded');
        },

        _format_loc: function (index, section, img_name) {
            var html;
            html = '<strong>' + index + '. ' + section + '</strong>';
            if (img_name) {
                img_name = img_name.split('/');
                img_name = img_name[img_name.length - 1];
                html += ' - ' + img_name;
            }
            html += ' (' + (UI.index + 1) + ' of ' + UI.gallery[section].length + ')';
            return html;
        },

        update_header: function (img_name) {
            var i = 0, loc_index, loc, prev_loc, next_loc;
            for (loc in UI.gallery) {
                if (UI.gallery.hasOwnProperty(loc)) {
                    i += 1;
                    if (loc === UI.section) {
                        loc_index = i;
                        UI.$els.location.innerHTML = UI._format_loc(i, loc);
                    } else if (i !== 0 && loc_index === undefined) {
                        prev_loc = loc;
                    } else if (loc_index !== undefined) {
                        next_loc = loc;
                        break;
                    }
                }
            }
            window.location.hash = "#i=" + (UI.index + 1);
        },

        init: function () {
            // fetch images.json and generate gallery information
            var loc;
            var xhr = new XMLHttpRequest();
            xhr.open('GET', './images.json', true);
            xhr.onload = function () {
                var images, i, item, loc, nav_path;
                if (this.status >= 200 && this.status < 300) {
                    images = JSON.parse(this.response).images;
                    for (i = 0; i < images.length; i++) {
                        nav_path = images[i].name.split('/');
                        loc = nav_path.slice(0, -1).join('/')
                        if (!UI.gallery.hasOwnProperty(loc)) {
                            UI.gallery[loc] = [];
                        }
                        UI.gallery[loc].push(images[i]);
                    }
                    UI.on_init();
                } else {
                    UI.error();
                }
            }
            xhr.onerror = function () {
                UI.error();
            }
            xhr.send();
        },

        on_init: function () {
            // cache UI parts
            UI.$cache('#content', 'content', {single: true});
            UI.$cache('#content .images', 'gallery', {single: true});
            UI.$cache('#content .nav-next', 'nav_next', {single: true});
            UI.$cache('#content .nav-prev', 'nav_prev', {single: true});
            UI.$cache('#locations', 'locations', {single: true});
            UI.$cache('#thumbnails', 'thumbnails', {single: true});
            UI.$cache('#thumbnails .browser', 'thumbnails_browser', {single: true});
            UI.$cache('#thumbnails .controls', 'thumbnails_controls', {single: true});
            UI.$cache('#footer', 'footer', {single: true});
            UI.$cache('#footer .images', 'footer_nav', {single: true});
            UI.$cache('#content .nav-next', 'next_image', {single: true});
            UI.$cache('#content .nav-prev', 'prev_image', {single: true});
            UI.$cache('#header .location', 'location', {single: true});
            UI.$cache('#header .auto-play .start', 'autoplay_start', {single: true});
            UI.$cache('#header .auto-play .stop', 'autoplay_stop', {single: true});
            UI.$cache('#header .auto-play .auto-play-ctr', 'autoplay_ctr', {single: true});
            // setup some general bindings
            UI.$els.autoplay_start.addEventListener('click', function () {
                UI.autoplay_start();
            });
            UI.$els.autoplay_stop.addEventListener('click', function () {
                UI.autoplay_stop();
            });
            UI.$els.nav_next.addEventListener('click', function () {
                UI.next_img();
            });
            UI.$els.nav_prev.addEventListener('click', function () {
                UI.prev_img();
            });
            UI.$els.content.addEventListener('click', function () {
                UI.hide_thumbnails();
            });
            UI.$1('.close', UI.$els.thumbnails_controls)
                .addEventListener('click', function () {
                    UI.hide_thumbnails();
                });
            UI.$1('.page-prev', UI.$els.thumbnails_controls)
                .addEventListener('click', function () {
                    UI.load_thumbnail_imgs(UI.index_thumbnails - (UI.num_thumbnails * 2) - 1);
                });
            UI.$1('.page-next', UI.$els.thumbnails_controls)
                .addEventListener('click', function () {
                    UI.load_thumbnail_imgs(UI.index_thumbnails + (UI.num_thumbnails * 2) + 1);
                });
            UI.$1('.nav-thmb', UI.$els.content).addEventListener('click', function (el) {
                UI.show_thumbnails();
                el.stopPropagation();
            });
            UI.$els.content.addEventListener('touchstart', UI._touch_start, {passive: true});
            UI.$els.content.addEventListener('touchmove', UI._touch_move, {passive: true});
            window.addEventListener('hashchange', UI.on_hashchange);
            window.addEventListener('resize', UI._format_imgs);
            document.body.addEventListener('keyup', function (ev) {
                // back/forward on left-right keyboard buttons
                if (ev.keyCode === 39) {
                    UI.next_img();
                } else if (ev.keyCode === 37) {
                    UI.prev_img();
                }
            });
            // and get it rollin'!
            UI.on_hashchange();
        }

    };

    UI.init();
    window.UI = UI;

})();
