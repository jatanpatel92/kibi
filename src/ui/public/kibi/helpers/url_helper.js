define(function (require) {

  var getSavedSearchMeta =  require('ui/kibi/helpers/count_helper/lib/get_saved_search_meta');
  var uniqFilters = require('ui/filter_bar/lib/uniqFilters');
  var rison = require('ui/utils/rison');
  var _ = require('lodash');

  return function UrlHelperFactory(
    Private, $location, $route, sessionStorage, savedDashboards,
    savedSearches, Promise, config, kbnDefaultAppId, kibiDefaultDashboardId, timefilter
  ) {
    var kibiStateHelper = Private(require('ui/kibi/helpers/kibi_state_helper'));
    var kibiTimeHelper = Private(require('ui/kibi/helpers/kibi_time_helper'));


    function UrlHelper() {
    }

    UrlHelper.prototype.getFiltersOfType = function (type) {
      var s = $location.search();
      var a = s._a;
      if (a) {
        var decodedA = rison.decode(a);
        if (decodedA.filters) {
          return _.filter(decodedA.filters, function (f) {
            return f[type];
          });
        }
      }
      return [];
    };

    UrlHelper.prototype.getJoinFilter = function () {
      var joinFilters = this.getFiltersOfType('join_set');
      if (joinFilters.length > 0) {
        return joinFilters[0];
      }
      return null;
    };

    UrlHelper.prototype.removeJoinFilter = function () {
      var s = $location.search();
      var a = s._a;
      if (a) {
        var decodedA = rison.decode(a);
        if (decodedA.filters) {
          var index = -1;
          _.each(decodedA.filters, function (f, i) {
            if (f.join_set) {
              index = i;
              return false;
            }
          });
          if (index !== -1) {
            decodedA.filters.splice(index, 1);
          }
          var encodedA = rison.encode(decodedA);
          $location.search('_a', encodedA);
        }
      }
    };

    UrlHelper.prototype.addFilter = function (filter) {
      var s = $location.search();
      var a = s._a;
      if (a) {
        var decodedA = rison.decode(a);
        if (!decodedA.filters) {
          decodedA.filters = [];
        }

        // here if there is a relational filter it should be replaced
        if (filter.join_set) {
          // replace
          var index = -1;
          _.each(decodedA.filters, function (f, i) {
            if (f.join_set) {
              index = i;
              return false;
            }
          });
          if (index !== -1) {
            // exists so replace
            decodedA.filters[index] = filter;
          } else {
            // do not exists so add
            decodedA.filters.push(filter);
          }
        } else {
          // add
          decodedA.filters.push(filter);
        }

        delete decodedA.panels;
        var encodedA = rison.encode(decodedA);
        $location.search('_a', encodedA);
      }
    };

    UrlHelper.prototype.switchDashboard = function (dashboardId) {
      if (dashboardId) {
        $location.path('dashboard/' + dashboardId);
        $route.reload();
      }
    };

    UrlHelper.prototype.replaceFiltersAndQueryAndTime = function (filters, query, time) {
      var s = $location.search();
      var a = s._a;
      var g = s._g;
      if (a) {
        var decodedA = rison.decode(a);
        if (filters) {
          decodedA.filters = filters;
        } else {
          decodedA.filters = [];
        }

        // replace only if the query object is present else remove it
        if (query === undefined) {
          delete decodedA.query;
        } else {
          decodedA.query = query;
        }

        delete decodedA.panels;
        var encodedA = rison.encode(decodedA);
        $location.search('_a', encodedA);
      }

      if (g) {
        var decodedG = rison.decode(g);
        if (time) {
          if (!decodedG.time) {
            decodedG.time = {};
          }
          decodedG.time.from = time.from;
          decodedG.time.to = time.to;

          var encodedG = rison.encode(decodedG);
          $location.search('_g', encodedG);
        }
      }
    };


    UrlHelper.prototype.isItDashboardUrl = function () {
      return $location.path() && $location.path().indexOf('/dashboard') === 0;
    };

    UrlHelper.prototype.getCurrentDashboardId = function () {
      var currentDashboardId;
      var currentPath = $location.path();
      if (currentPath.indexOf('/dashboard/') === 0) {
        currentDashboardId = currentPath.replace('/dashboard/', '');
      }
      return currentDashboardId;
    };


    // creates a map index -> dashboards
    // {
    //   indexId: [dashboardId1, dashboardId2],
    //   ...
    // }
    UrlHelper.prototype.getIndexToDashboardMap = function (dashboardsIds) {

      var _createMap = function (results) {
        // postprocess the results to create the map
        var indexToDashboardArrayMap = {};
        _.each(results, function (mapping) {
          if (!indexToDashboardArrayMap[mapping.indexId]) {
            indexToDashboardArrayMap[mapping.indexId] = [mapping.dashboardId];
          } else {
            if (indexToDashboardArrayMap[mapping.indexId].indexOf(mapping.dashboardId) === -1) {
              indexToDashboardArrayMap[mapping.indexId].push(mapping.dashboardId);
            }
          }
        });
        return indexToDashboardArrayMap;
      };

      return savedDashboards.find().then(function (resp) {
        var promises = [];
        _.each(resp.hits, function (dashboard) {
          // here filter dashboards if dashboardsIds provided
          if (dashboardsIds && dashboardsIds.length > 0 && dashboardsIds.indexOf(dashboard.id) !== -1 && dashboard.savedSearchId) {
            promises.push(
              savedSearches.get(dashboard.savedSearchId).then(function (dashboardSavedSearch) {
                return {
                  dashboardId: dashboard.id,
                  indexId: dashboardSavedSearch.searchSource._state.index.id
                };
              })
            );
          } else if ((!dashboardsIds || !dashboardsIds.length) && dashboard.savedSearchId) {
            promises.push(
              savedSearches.get(dashboard.savedSearchId).then(function (dashboardSavedSearch) {
                return {
                  dashboardId: dashboard.id,
                  indexId: dashboardSavedSearch.searchSource._state.index.id
                };
              })
            );
          }
        });

        return Promise.all(promises).then(function (results) {
          return _createMap(results);
        });
      });
    };

    /**
     * The relations are from kibi:relations.relationsDashboards
     */
    UrlHelper.prototype.isDashboardInTheseRelations = function (dashboardId, relations) {
      if (relations) {
        for (var i = 0; i < relations.length; i++) {
          var relation = relations[i];
          if (relation.dashboards[0] === dashboardId || relation.dashboards[1] === dashboardId) {
            return true;
          }
        }
      }
      return false;
    };

    /**
     * For each dashboard id in the argument, return a promise with the saved dashboard and associated saved search meta
     */
    UrlHelper.prototype.getDashboardAndSavedSearchMetas = function (dashboardIds) {
      return Promise.all([ savedSearches.find(), savedDashboards.find() ]).then((results) => {
        const savedSearchesRes = results[0];
        const savedDashboardsRes = results[1];

        const promises = _(savedDashboardsRes.hits)
        // keep the dashboards that are in the array passed as argument
        .filter((savedDash) => !dashboardIds || _.contains(dashboardIds, savedDash.id))
        .map((savedDash) => {
          if (!savedDash.savedSearchId) {
            return Promise.reject(new Error(`The dashboard [${savedDash.title}] is expected to be associated with a saved search`));
          }
          const savedSearch = _.find(savedSearchesRes.hits, (hit) => hit.id === savedDash.savedSearchId);
          const savedSearchMeta = getSavedSearchMeta(savedSearch);
          return [ savedDash, savedSearchMeta ];
        })
        .value();

        return Promise.all(promises);
      });
    };

    /**
     * Return a promise with the set of queries associated with the dashboard, and in its saved search
     */
    UrlHelper.prototype._getQueriesFromDashboard = function (savedDash, savedSearchMeta) {
      const queries = [];

      //  query from the kibiState
      const query = kibiStateHelper.getQueryForDashboardId(savedDash.id);
      if (query) {
        queries.push(query);
      }
      // query from the saved search
      if (savedSearchMeta.query) {
        queries.push(savedSearchMeta.query);
      }
      const queriesIndex = {};
      queriesIndex[savedSearchMeta.index] = queries;
      return Promise.resolve(queriesIndex);
    };

    /**
     * Return a promise with the set of filters associated with the dashboard, and in its saved search
     */
    UrlHelper.prototype._getFiltersFromDashboard = function (savedDash, savedSearchMeta) {
      // filters from kibiState
      const dashFilters = kibiStateHelper.getFiltersForDashboardId(savedDash.id) || [];
      let filters = _.filter(dashFilters, (df) => !df.join_set);
      // filters from savedSearchMeta
      if (savedSearchMeta.filter) {
        filters = filters.concat(savedSearchMeta.filter);
      }

      const filtersIndex = {};

      // time filter from kibiState
      return savedSearches.get(savedDash.savedSearchId).then(function (dashboardSavedSearch) {
        const timeFilter = timefilter.get(dashboardSavedSearch.searchSource._state.index);
        if (timeFilter) {
          return kibiTimeHelper.updateTimeFilterForDashboard(savedDash.id, timeFilter)
          .then((updatedTimeFilter) => {
            filters.push(updatedTimeFilter);
            filtersIndex[savedSearchMeta.index] = uniqFilters(filters);
            return filtersIndex;
          });
        } else {
          filtersIndex[savedSearchMeta.index] = uniqFilters(filters);
          return Promise.resolve(filtersIndex);
        }
      });
    };

    /**
     * Return a promise with the filters from each dashboard organised per associated index
     */
    UrlHelper.prototype.getFiltersPerIndexFromDashboards = function (dashboardIds) {
      if (!dashboardIds) {
        return Promise.reject(new Error('getFiltersPerIndexFromDashboards requires a list of dashboard IDs'));
      }

      return this.getDashboardAndSavedSearchMetas(dashboardIds).then((results) => {
        const filters = _.map(results, ([ savedDash, savedSearchMeta ]) => this._getFiltersFromDashboard(savedDash, savedSearchMeta));
        return Promise.all(filters).then((results) => {
          return _({}).merge(...results, (filter1, filter2) => {
            if (!filter1) {
              return filter2;
            }
            if (!filter2) {
              return filter1;
            }
            return filter2.concat(filter1);
          })
          .mapValues((filters) => uniqFilters(filters))
          .value();
        });
      });
    };

    /**
     * Return a promise with the queries from each dashboard organised per associated index
     */
    UrlHelper.prototype.getQueriesPerIndexFromDashboards = function (dashboardIds) {
      if (!dashboardIds) {
        return Promise.reject(new Error('getQueriesPerIndexFromDashboards requires a list of dashboard IDs'));
      }

      return this.getDashboardAndSavedSearchMetas(dashboardIds).then((results) => {
        const filters = _.map(results, ([ savedDash, savedSearchMeta ]) => this._getQueriesFromDashboard(savedDash, savedSearchMeta));
        return Promise.all(filters).then((results) => _.merge({}, ...results, (query1, query2) => {
          if (!query1) {
            return query2;
          }
          if (!query2) {
            return query1;
          }
          return query2.concat(query1);
        }));
      });
    };

    /**
     * Returns a promise with objects (either queries or filters) come from:
     * - a set of dashboards associated with the same index as dashboardId.
     * - the dashboards are part of an enabled relation.
     * The promised object is an array with an element being an array of objects for some dashboard.
     */
    UrlHelper.prototype._objectsFromDashboardsWithSameIndexInEnabledRelations = function (dashboardId, cb) {
      if (!config.get('kibi:relationalPanel')) {
        return Promise.resolve([]);
      }

      // grab only enabled relations based on kibiState
      const relationsDashboards = config.get('kibi:relations').relationsDashboards;
      const enabledRelations = _.filter(relationsDashboards, (relation) => kibiStateHelper.isRelationEnabled(relation));

      if (!this.isDashboardInTheseRelations(dashboardId, enabledRelations)) {
        return Promise.resolve([]);
      }

      return this.getDashboardAndSavedSearchMetas().then((results) => {
        const [ savedDash, savedSearchMeta ] = _.find(results, ([ savedDash, savedSearchMeta ]) => savedDash.id === dashboardId);
        if (!savedSearchMeta) {
          return Promise.resolve([]);
        }
        const index = savedSearchMeta.index;

        // all dashboards:
        // - except the one from the given argument
        // - which index is the same as the one associated with the dashboard in argument
        const promises = _(results)
        // filter out dashboards that are in the array passed as argument
        .filter(([ savedDash, savedSearchMeta ]) => dashboardId !== savedDash.id)
        // remove dashboards that are not in any enabled relations
        .filter(([ savedDash, savedSearchMeta ]) => this.isDashboardInTheseRelations(savedDash.id, enabledRelations))
        .map(([ savedDash, savedSearchMeta ]) => {
          if (index !== savedSearchMeta.index) {
            return Promise.resolve({});
          }
          return cb(savedDash, savedSearchMeta);
        })
        .value();
        return Promise.all(promises).then((results) => {
          let elements = [];
          _.each(results, (object) => {
            if (object[index]) {
              elements = elements.concat(...object[index]);
            }
          });
          return elements;
        });
      });
    };

    /**
     * For each dashboard based on the same index that is in an enabled relation, it should take:
     *  a) filters from kibiState (except join_set one)
     *  b) time from kibiState (transform it to proper range filter)
     *  c) filters from savedSearch Meta
     * Do it only if the relational panel is enabled.
     */
    UrlHelper.prototype.getFiltersFromDashboardsWithSameIndex = function (dashboardId) {
      if (!dashboardId) {
        return Promise.reject(new Error('getFiltersFromDashboardsWithSameIndex requires a list of dashboard IDs'));
      }

      return this._objectsFromDashboardsWithSameIndexInEnabledRelations(dashboardId, this._getFiltersFromDashboard);
    };

    /**
     * For each dashboard based on the same index that is in an enabled relation, it should take:
     *  a) queries from kibiState (except join_set one)
     *  c) queries from savedSearch Meta
     * Do it only if the relational panel is enabled.
     */
    UrlHelper.prototype.getQueriesFromDashboardsWithSameIndex = function (dashboardId) {
      if (!dashboardId) {
        return Promise.reject(new Error('getQueriesFromDashboardsWithSameIndex requires a list of dashboard IDs'));
      }

      return this._objectsFromDashboardsWithSameIndexInEnabledRelations(dashboardId, this._getQueriesFromDashboard);
    };

    UrlHelper.prototype.getCurrentDashboardQuery = function () {
      var currentDashboardId = this.getCurrentDashboardId();
      if (!currentDashboardId) {
        return;
      }

      var s = $location.search();
      var a = s._a;

      if (a) {
        var decodedA = rison.decode(a);
        return decodedA.query;
      }
      return null;
    };

    UrlHelper.prototype.getCurrentDashboardFilters = function () {
      var currentDashboardId = this.getCurrentDashboardId();
      if (!currentDashboardId) {
        return;
      }
      var s = $location.search();
      var a = s._a;
      if (a) {
        var decodedA = rison.decode(a);
        if (decodedA.filters) {
          return _.filter(decodedA.filters, function (f) {
            return f.meta && f.meta.disabled !== true;
          });
        }
      }
      return null;
    };

    UrlHelper.prototype.getPathnameFromUrl = function (url) {
      var start = url.indexOf('#');
      var stop = url.indexOf('?', start) || url.length;
      return url.substring(start, stop);
    };

    UrlHelper.prototype._getParamFromUrl = function (url, paramName, urlStateParamName) {
      var start = url.indexOf('#');
      start = start === -1 ? url.indexOf('?') : url.indexOf('?', start);
      var queryString = url.substring(start + 1);
      var paramPairs = queryString.split('&');
      for (var i = 0; i < paramPairs.length; i++) {
        var pair = paramPairs[i];
        var parts = pair.split('=');
        if (parts[0] === urlStateParamName && parts.length === 2) {
          var decodedA = rison.decode(parts[1]);
          return decodedA[paramName];
        }
      }
    };

    UrlHelper.prototype.getLocalParamFromUrl = function (url, paramName) {
      return this._getParamFromUrl(url, paramName, '_a');
    };
    UrlHelper.prototype.getGlobalParamFromUrl = function (url, paramName) {
      return this._getParamFromUrl(url, paramName, '_g');
    };

    // tabs should be taken from chrome.getTabs();
    UrlHelper.prototype.getInitialPath = function (app, tabs) {
      var self = this;
      return new Promise(function (fulfill, reject) {
        var defaultApp = _.find(tabs, function (app) {
          return app.id === kbnDefaultAppId;
        });

        if (typeof app === 'undefined') {
          app = defaultApp;

          if (typeof app === 'undefined' || app === null || app === false) {
            fulfill('/');
            return;
          }
          app.rootUrl = app.lastUrl;
        }

        if (app && app.id === 'kibana' && defaultApp && defaultApp.id === 'dashboard') {
          if (kibiDefaultDashboardId && kibiDefaultDashboardId !== '') {
            // check that the dashboard exists
            savedDashboards.get(kibiDefaultDashboardId).then(function (savedDashboard) {
              fulfill('/' + defaultApp.id + '/' + savedDashboard.id);
            }).catch(function (err) {
              // could not find the specified dashboard, open the first available
              savedDashboards.find().then(function (resp) {
                if (resp.hits && resp.hits.length > 0) {
                  fulfill('/' + defaultApp.id + '/' + resp.hits[0].id);
                } else {
                  // no dashboards, display the creation form
                  fulfill('/' + defaultApp.id);
                }
              });
            });
          } else {
            // kibiDefaultDashboardId not set open the first dashboard
            savedDashboards.find().then(function (resp) {
              if (resp.hits && resp.hits.length > 0) {
                fulfill('/' + defaultApp.id + '/' + resp.hits[0].id);
              } else {
                // no dashboards, display the creation form
                fulfill('/' + defaultApp.id);
              }
            });
          }
        } else {
          if (defaultApp) {
            fulfill(defaultApp.lastUrl ? defaultApp.lastUrl : defaultApp.rootUrl);
          } else if (defaultApp === undefined && kbnDefaultAppId) {
            fulfill('/' + kbnDefaultAppId);
          }
        }
      });
    };

    UrlHelper.prototype.shouldUpdateCountsBasedOnLocation = function (oldUrl, newUrl) {
      var newPath = this.getPathnameFromUrl(newUrl);
      var oldPath = this.getPathnameFromUrl(oldUrl);

      var newFilters = this.getLocalParamFromUrl(newUrl, 'filters');
      var oldFilters = this.getLocalParamFromUrl(oldUrl, 'filters');
      var newQuery = this.getLocalParamFromUrl(newUrl, 'query');
      var oldQuery = this.getLocalParamFromUrl(oldUrl, 'query');

      var newGlobalFilters = this.getGlobalParamFromUrl(newUrl, 'filters');
      var oldGlobalFilters = this.getGlobalParamFromUrl(oldUrl, 'filters');
      var newGlobalTime = this.getGlobalParamFromUrl(newUrl, 'time');
      var oldGlobalTime = this.getGlobalParamFromUrl(oldUrl, 'time');

      return newPath === oldPath && (
             !_.isEqual(newFilters, oldFilters, true) ||
             !_.isEqual(newQuery, oldQuery, true) ||
             !_.isEqual(newGlobalFilters, oldGlobalFilters, true) ||
             !_.isEqual(newGlobalTime, oldGlobalTime, true));
    };



    return new UrlHelper();
  };

});
