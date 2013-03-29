
// TODO
//
// *   sort by "top" + voting
// *   remixing of an existing picdinner
// *   simple gif search - maybe just scrape http://www.reddit.com/r/woahdude.json & http://www.reddit.com/r/gifs.json?
// *   simple soundcloud search
//

Pairs = new Meteor.Collection('pairs');

Pairs.allow({
    insert: function(userId, doc) {
        if (doc.userId && doc.userId != userId) {
            return false;
        }
        return true;
    },
    update: function(userId, docs, fields, modifier) {
        if (fields.userId && fields.userId != userId) {
            return false;
        }
        return false;
    },
    remove: function(userId, docs) {
        if (!userId) return false;
        var i = docs.length;
        while (i--) {
            if (docs[i].userId != userId) {
                return false;
            }
        }
        return true;
    }
});

function createdNow() {
    return (new Date()).getTime();
}

function lookupNext(currentCreated, prev) {
    if (!currentCreated) return null;
    return Pairs.findOne({
        created: prev ? {'$gt': currentCreated} : {'$lt': currentCreated}
    }, {
        sort: {'created': prev ? 1 : -1},
        limit: 1
    });
}

if (Meteor.isClient) {

    function log() {
        try {
            console.log.apply(console, arguments);
        } catch(e) {}
    }

    function setIfNotEqual(attr, val) {
        if (!Session.equals(attr, val)) {
            Session.set(attr, val);
        }
    }

    // auto update pair subscription when it changes
    Deps.autorun(function() {
        var curPairId = Session.get('curPairId'),
            lastCreated = Session.get('lastCreated'),
            curCreated = Session.get('currentCreated'),
            sortType = Session.get('sortType'),
            viewUserId = Session.get('viewUserId');
        Meteor.subscribe('pairs', lastCreated, sortType, viewUserId);
        Meteor.subscribe('pair', curPairId);
        Meteor.subscribe('prevPair', curCreated, sortType, viewUserId);
        Meteor.subscribe('nextPair', curCreated, sortType, viewUserId);
    });

    //
    // Head
    //
    Template.head.events({
        'click #add': function() {
            $('#add-pair').modal();
        }
    });

    //
    // Options
    //
    Template.options.sortType = function() {
        return Session.get('sortType');
    };

    _.each(['newest', 'top', 'user'], function(x) {
        Template.options[x] = function() {
            return Session.get('sortType') == x ? 'strong' : '';
        };
    });

    //
    // Add Pair
    //
    Template.addPair.formNoImage = function() {
        return Session.get('formNoImage');
    };

    Template.addPair.events({
        'submit form': function(e) {
            e.preventDefault();
            var $form = $(e.target),
                $image = $form.find('input[name=image]'),
                $audio = $form.find('input[name=audio]'),
                image = $image.val(),
                audio = $audio.val();

            if (!audio) { audio = 'song.mp3'; }

            if (!image) {
                Session.set('formNoImage', true);
                //TODO - maybe this should be part of allow/deny instead?
                return;
            }

            var _rImgur = /^https?:\/\/imgur.com/i,
                _rSuffix = /\.[^\/]+$/i;

            if (_rImgur.test(image) && !_rSuffix.test(image)) {
                var t = image.split('/').pop();
                image = 'http://imgur.com/' + t + '.gif';
            }

            var data = {
                image: image,
                audio: audio,
                created: createdNow()
            };

            if (Meteor.userId()) {
                data.userId = Meteor.userId();
            }

            var id = Pairs.insert(data);

            recents.add(id);

            $form.find('input').val('');
            Session.set('formNoImage', false);
            $('#add-pair').modal('hide');
        },
        'change input, keyup input': function() {
            Session.set('formNoImage', false);
        }
    });

    Meteor.startup(function() {
        // other options: hidden, show, shown
        $('#add-pair').on('hide', function() {
            Backbone.history.navigate(getBackUrl(), true);
        });
    });

    //
    // Pairs
    //
    var Paginator = (function() {
        // pretty jenky first attempt at pagination
        // -  things flicker when you click next
        // -  not sure how to check if there are no pairs in the template
        // -  stores state in js
        var self = {
            lastCreatedStack: [],
            addNewest: function() {
                var lastCreated = $('#pairs').find('.pair').last().data('created');
                if (!lastCreated) {
                    self.lastCreatedStack = [];
                } else {
                    self.lastCreatedStack.push(Session.get('lastCreated'));
                }
                Session.set('lastCreated', lastCreated);
                self._updateState();
            },
            popNewest: function() {
                var lastCreated = self.lastCreatedStack.pop() || null;
                Session.set('lastCreated', lastCreated);
                self._updateState();
            },
            _updateState: function() {
                setIfNotEqual('hasPrev', self.lastCreatedStack.length != 0);
                setIfNotEqual('hasNext',
                              (self.lastCreatedStack.length == 0 ||
                               $('#pairs').find('.pair').size() != 0));
            }
        };
        self._updateState();
        return self;
    })();

    Template.pairs.hasPrev = function() { return Session.get('hasPrev'); };
    Template.pairs.hasNext = function() { return Session.get('hasNext'); };

    Template.pairs.pairs = function() {
        var query = {},
            lastCreated = Session.get('lastCreated');
        if (lastCreated) {
            query.created = {'$lt': lastCreated};
        }
        return Pairs.find(query, {sort: {"created": -1}});
    };

    Template.pairs.events({
        'click .next': Paginator.addNewest,
        'click .prev': Paginator.popNewest
    });

    Template.pairs.rendered = function() {
        var colors = 'fdd dfd ddf ffd fdf dff'.split(' '),
            $pairs = $('#pairs'),
            i = 0,
            len = colors.length;
        function bgFn() {
            if (i >= len) i = 0;
            return '#' + colors[i++];
        }
        $pairs.find('a.pair>img').stopgifs({
            parentClosest: '.pair',
            background: bgFn
        });
    };

    //
    // History
    //
    var recents = {
        get: function() {
            var h, th;
            try {
                th = JSON.parse(localStorage.getItem('recents'));
                h = [];
                _.each(th, function(x) {
                    if (x) { h.push(x); }
                });
            } catch(e) {}
            if (!h) { h = []; }
            return h;
        },
        add: function(_id) {
            var h = recents.get();
            if (_id) h.unshift(_id);
            h = h.slice(0, 5);
            localStorage.setItem('recents', JSON.stringify(h));
            Session.set('recents', h);
            return recents;
        }
    };
    recents.add();

    Template.history.history = function() {
        var names = 'Dengus, Paynuss, Fibbus, Chonus, Taargus'.split(', '),
            i = 0;
        return _.map(Session.get('recents'), function(id) {
            return {id: id, name: names[i++] || id};
        });
    };

    //
    // Shares Base
    //
    Template.sharesPrimary.shareUrls = function() {
        //TODO - not have to do the stupid list as a hack
        //       to use parent templates, e.g., sharesPrimary
        return [{shareUrl: 'http://picdinner.com'}];
    };

    Template.sharesSecondary.shareUrls = function() {
        var id = Session.get('currentPairId');
        return id ? [{shareUrl: 'http://picdinner.com/'+id}] : [];
    };

    //
    // View Pair
    //
    var scWidget = null;
    var viewer = {
        active: false,
        pairId: null,
        audio: null,
        update: function(pairId, pair) {
            // open
            if (pair) {
                var isSoundCloud = this.isSoundCloud(pair.audio);
                var $viewImage = $('#view-image');

                if (!this.pairId || this.pairId != pairId) {
                    this.clear();
                    var au = isSoundCloud ? null :
                        $.extend(new Audio(), {
                            autoplay: true,
                            loop: true,
                            src: pair.audio
                        });
                    this.audio = au;
                    this.pairId = pairId;

                    if (isSoundCloud) {
                        $viewImage.fadeOut(0);
                        scWidget.load(pair.audio, {
                            callback: function() {
                                log('[CALLBACK]');
                                $('#widget').fadeIn('slow');
                                scWidget.play();
                                $viewImage.fadeIn();

                                // HACK sometimes soundcloud fails to start
                                Meteor.setTimeout(function() {
                                    scWidget.isPaused(function(paused) {
                                        if (paused && viewer.pairId == pairId) {
                                            log('  still paused, hitting play again.');
                                            scWidget.play();
                                        }
                                    });
                                }, 500);
                            }
                        });
                    }

                    this.active = true;

                    if (!this.didFirstUpdate) {
                        // animate head
                        var $h = $('#head').addClass('trans');
                        Meteor.setTimeout(function() {
                            $h.addClass('go');
                            Meteor.setTimeout(function() {
                                $h.removeClass('trans').removeClass('go');
                            }, 4000);
                        }, 500);
                    }
                }

                var arg = isSoundCloud ? {marginBottom: 166} : {};
                $viewImage.expandImage(arg);

                this.didFirstUpdate = true;

            // close
            } else if (!pairId) {
                this.clear();

                // change back to root URL, unless we're already there
                // or already not active (e.g., load /add)
                if (this.active) {
                    Backbone.history.navigate(getBackUrl(), true);
                }

                this.active = false;
                this.didFirstUpdate = true;
            }
        },
        clear: function() {
            if (this.pairId) {
                this.pairId = null;
                if (this.audio) {
                    this.audio.pause();
                    this.audio = null;
                }
                scWidget.pause();
                $('#widget').hide();
                $('#view-image').expandImage('clear');
            }
        },
        toggleAudio: function() {
            if (this.audio) {
                this.audio[this.audio.paused ? 'play' : 'pause']();
            } else {
                scWidget.toggle();
            }
        },
        isSoundCloud: function(audio) {
            return audio && /^https?:\/\/soundcloud.com\/.+/i.test(audio);
        }
    };

    Template.viewPair.pairId = function() {
        return Session.get('currentPairId');
    };

    Template.viewPair.pair = function() {
        var p = Pairs.findOne({'_id': Session.get('currentPairId')});
        Session.set('currentCreated', p ? p.created : null);
        return p;
    };

    Template.viewPair.nextPair = function() {
        var currentCreated = Session.get('currentCreated');
        return lookupNext(currentCreated, false);
    };

    Template.viewPair.prevPair = function() {
        var currentCreated = Session.get('currentCreated');
        return lookupNext(currentCreated, true);
    };

    Template.viewPair.isSoundCloud = function(audio) {
        return viewer.isSoundCloud(audio);
    };

    Template.viewPair.backUrl = getBackUrl;

    Template.viewPair.rendered = function() {
        viewer.update(Session.get('currentPairId'), Template.viewPair.pair());
        SharesLoader.load();
    };

    Template.viewPair.events({
        'click': function(e) {
            if (e.target.id == 'view-pair') {
                Session.set('currentPairId', null);
            }
        },
        'click a.close': function(e) {
            e.preventDefault();
            Session.set('currentPairId', null);
        }
    });

    Meteor.startup(function() {
        $(window).on('keyup', function(e) {
            if (viewer.active) {
                if (e.which == 27) {
                    Session.set('currentPairId', null);
                } else if (e.which == 32) {
                    viewer.toggleAudio();
                }
            }
        });

        // // initialize soundcloud client
        // SC.initialize({
        //     client_id: 'f6ea539c4f3ba2383cacb0b3e1926f11'
        // });
    });


    //
    // URL Routing
    //
    var sortTypeRoutes = {
        newest: function() { return '/'; },
        top: function() { return '/top'; },
        user: function() {
            var userId = Meteor.userId();
            return userId ? '/user/' + userId : sortTypeRoutes.newest();
        }
    };
    function getBackUrl() {
        return (sortTypeRoutes[Session.get('sortType')] ||
                sortTypeRoutes.newest)();
    }

    Meteor.startup(function() {

        var customRoutes = {
            add: function() {
                $('#add-pair').modal();
            },
            top: function() {
                Session.set('sortType', 'top');
            }
        };

        Backbone.PushStateRouter({
            '': 'main',
            ':id': 'main',
            'user/:id': 'user'
        }, {
            main: function(id) {
                var customRoute = customRoutes[id];
                if (!id) { Session.set('sortType', 'newest'); }
                if (customRoute || !id) { id = null; }
                if (customRoute) { customRoute(); }
                Session.set('currentPairId', id);
            },
            user: function(id) {
                Session.set('currentPairId', null);
                Session.set('sortType', 'user');
                Session.set('viewUserId', id);
            }
        });
    });

    Meteor.startup(function() {

        // SoundCloud html5 widget
        // [docs](http://developers.soundcloud.com/docs/api/html5-widget)
        scWidget = SC.Widget('widget');

        scWidget.bind(SC.Widget.Events.READY, function() {
            log('[READY]');
            scWidget.bind(SC.Widget.Events.PLAY, function() {
                log('[PLAY]');
                if (viewer.pairId && viewer.audio) {
                    log('  PAUSING!', viewer.pairId, viewer.audio);
                    scWidget.pause();
                }
                // // get information about currently playing sound
                // scWidget.getCurrentSound(function(currentSound) {
                //     console.log('sound ' + currentSound.title + 'began to play');
                // });
            });

            scWidget.bind(SC.Widget.Events.FINISH, function() {
                var $next = $('#next-pair');
                log('[FINISH]', '$next', $next.attr('href'));
                if ($next.size()) {
                    scWidget.pause();
                    Backbone.history.navigate($next.attr('href'), true);
                }
            });
            //scWidget.play();
        });
    });
}

if (Meteor.isServer) {

    var pairsLimit = 15;

    Meteor.publish('pairs', function(lastCreated, sortType, viewUserId) {
        var query = {},
            sort = {'created': -1};

        if (sortType == 'user') {
            query.userId = viewUserId;
        } else if (sortType == 'top') {
            sortType = {'votes': 1};
        }

        if (lastCreated) {
            query.created = {'$lt': lastCreated};
        }
        return Pairs.find(query, {sort: sort, limit: pairsLimit});
    });

    Meteor.publish('pair', function(pairId) {
        return Pairs.find({_id: pairId});
    });

    Meteor.publish('prevPair', function(currentCreated) {
        return lookupNext(currentCreated, true);
    });

    Meteor.publish('nextPair', function(currentCreated) {
        return lookupNext(currentCreated, false);
    });

    Meteor.startup(function () {
        // code to run on server at startup
    });

    Meteor.methods({
        fixCreated: function() {
            Pairs.find({}).forEach(function(x) {
                if (!/^\d+$/.test(x.created)) {
                    var t;
                    try {
                        t = (new Date(x.created)).getTime();
                        if (isNaN(t.getTime())) {
                            throw new Error('not a number!');
                        }
                    } catch(e) {
                        t = createdNow();
                    }
                    Pairs.update({_id: x._id}, {$set: {created: t}});
                };
            });
        }
    });
}




// Ideas:
//
// *   meteor add less and just write in less
// *   one page app - all files load on one page
// *   html file is parts: head / body / templates
// *   change file names so not all the same! app.js / style.css
// *   reactivity and template updates happens via Session variables
// *   use subscribe to limit what data is shared and better
//     use autosubscribe wrapper to update based on Session variables

// TODO:
//
// *   only play music when in foreground
// *   better way to select gifs and music
// *   extras? crazy backgrounds instead of #111? (text or title? -- too much?)
// *   image and sound upload
// *   thumbs of images (via canvas?)... and way to visualize sound?
// *   social stuff ... top pics, colors for viewing, login
// *   navigation to other pictures
