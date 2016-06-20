/*global angular, _, document */
'use strict';
angular.module('voyager.search')
	.controller('SearchCtrl', function ($scope, cartService, searchService, $location, authService, loading, $window, $document,
										usSpinnerService, configService, localStorageService, config, $analytics, savedSearchService,
										recentSearchService, filterService, cartItemsQuery, $timeout, inView, $q, searchScroll,
										urlUtil, searchViewService, searchModalService, tagService, $log) {

		var _busy = true;
		//var _scrollTimer;
		var _initializing = true;
		var _page = 1;
		var _params = $location.search();
		var _searching = false;
		var _bannerAdjusted = false;

		$scope.showPan = true;

		function _init() {
			inView.reset();

			$scope.uiText = config.ui.list;

			$scope.bigMap = false;
			$scope.mapSize = 'small-map';
			$scope.showGrid = false;
			// $scope.showMap = configService.showMap();
			$scope.result = {};
			$scope.filterVisible = false;
			$scope.placefinderLink = config.root + 'manage/settings/placefinder';
			$scope.eof = false;
			$scope.pageFramework = configService.getPageFramework();

			if(!$scope.pageFramework.showMap){
				angular.element('body').addClass('no-map');
			}

			loading.show('#working');

			if (_params.pg && _params.pg > 1) {
				_page = parseInt(_params.pg);
			}

			//$scope.saved = _.isEmpty(_params.id) ? false : true;

			if (!_.isEmpty(_params.disp)) {
				$scope.disp = _params.disp;
			}

			if (!_.isEmpty(_params.mapsize)) {
				$scope.tableViewMapSize = _params.mapsize;
			}
			else {
				$scope.tableViewMapSize = 'large';
			}

			$scope.count = 0;
			$scope.maxSize = 5;
			$scope.totalItems = 1; //default so no results message doesn't display when loading

			if (_.isEmpty(_params.view)) {
				$scope.view = configService.getDefaultView();
				$location.search('view', $scope.view);
			} else if (_params.view === 'table') {
				$scope.view = 'table';
				searchService.setItemsPerPage(50);
			} else {
				$scope.view = _params.view;
			}
			_initFilters();
		}

		//TODO move this to filter controller init?
		function _initFilters() {
			$timeout(function() {  //allow components to set up event binding

				if(!_.isEmpty(_params.fq)) {
					filterService.setFilters(_params.fq);
				}

				$scope.$emit('filterEvent', {});
				searchService.clear();

				if($location.search().filter === 'true') {
					$scope.filterVisible = false;
					$scope.toggleFilter(); //will toggle it to ttue
				}
			});
		}

		_init();

		function _reloadResults(response) {
			if(response.action === 'login') {
				_init();
			}
		}
		authService.addObserver(_reloadResults);

		function _setSortDirection() {
			if (searchService.getSort()) {
				$scope.sortDirection = searchService.getSort();
			} else {
				$scope.sortDirection = 'asc';
			}
		}

		function _searchSuccess() {
			//$scope.saved = _.isEmpty(_params.id) ? false : true;
			$scope.currentPage = _page; //fires watcher below
			_setSortDirection();
			_initializing = false;
			if ($scope.view === 'table') {
				$scope.showGrid = true;
			}
			loading.done();
			$scope.selectedFilters = filterService.getFilters();
			_busy = false;
		}

		function _setSortField() {
			if (!_.isEmpty(_params.sort)) {
				if(_params.sort.indexOf(' ') !== 0) {
					$scope.sortField = _params.sort.split(' ')[0];
				} else {
					$scope.sortField = _params.sort;
				}
				for (var field in $scope.sortable) {
					if ($scope.sortable[field].key === $scope.sortField) {
						$scope.displaySortField = $scope.sortable[field].value;
						break;
					}
				}
			} else {
				$scope.displaySortField = $scope.sortable[0].value;
				$scope.sortField = $scope.sortable[0].key;
			}
		}

		function _syncCartState(docs) {
			if(cartService.hasItems()) {
				var itemIds = searchService.getPageIds();
				//only sync the last n items so we don't resync when infinite scrolling
				itemIds = itemIds.slice(Math.max(itemIds.length - searchService.getItemsPerPage(), 0));
				return cartService.fetchQueued(itemIds).then(function(items) {
					_setCartState(items, docs);
					$scope.$broadcast('syncCard', {});
				});
			} else {
				return $q.when({});
			}
		}

		// update cart count in case something was removed from index
		function _syncCartCount() {
			cartService.fetch(false).then(function(data) {
				cartService.setQueryCount(data.count);
			}, function(error) {
				$log.error(error);
			});
		}

		function _handleSearchError(res) {
			searchScroll.setPosition(0);
			$scope.eof = false;
			$scope.totalItems = 0;
			$scope.results = {};
			loading.done();
			_busy = false;
			_searching = false;
			_initializing = false;
			$scope.searchError = true;
			res.data = {response:{docs:[]}};
			$scope.$emit('searchComplete', res.data); //so table view updates
			_setPageClass();
		}

		function checkFederations(res) {
			var shards = res.data['shards.info'];
			if (shards) {
				for (var shard in shards) {
					if (!_.isEmpty(shards[shard].error)) {
						$scope.resultError = true;
						$scope.resultStackTrace = shards;
						_setPageClass();
						break;
					}
				}
			}
		}

		function checkEsriGeocoder(res) {
			var placefinder = res.data.response.placefinder;
			$scope.esriGeocodeServiceError = placefinder && placefinder.errors && placefinder.errors.esri;
		}

		function _doSearch() {
			if(!$scope.pageFramework.showHeaderInfo && $location.path().indexOf('/search') > -1){
				angular.element('body').addClass('no-header');
			} else {
				angular.element('body').removeClass('no-header');
			}

			_searching = true;
			$scope.sortable = configService.getSortable();

			_setSortField();

			document.body.scrollTop = document.documentElement.scrollTop = 0;  //scroll to top

			loading.show('#working');

			_params = $location.search();

			searchScroll.prepare(_params.view);

			searchService.setPage(1);  //always reset to page one when new search

			searchService.doSearch2(_params).then(function(res) {
				loading.done();
				$scope.$emit('searchComplete', res.data);
				$scope.results = res.data.response.docs;
				$scope.totalItems = res.data.response.numFound;
				$scope.eof = $scope.totalItems > 0 && $scope.results.length >= $scope.totalItems;
				_syncCartState($scope.results);
				_syncCartCount();
				_searchSuccess();
				_searching = false;
				$scope.searchError = false;
				checkFederations(res);
				checkEsriGeocoder(res);
				$location.search('block', null);
				if(searchScroll.getPosition() > 0) {
					_page = searchScroll.getPage();  //so infinite scroll is on the right page
					searchScroll.do(_params.view);
				}
				$scope.resetTable = false;
				$scope.gridView = configService.getGridView();

			}, function(res){
				_handleSearchError(res);
			});

			if (_page === 1) {
				if (_.isEmpty(_params.id) && _.isEmpty(_params.recent)) {
					recentSearchService.addItem(_params);
				}
			}
		}

		$scope.$on('doSearch', function (e, options) {
			if (!_initializing || (options && options.force)) {
				searchScroll.setPosition(0);
				_params = $location.search();
				if(angular.isDefined(_params.sort)) {
					searchService.setSortField(_params.sort);
					if(angular.isDefined(_params.sortdir)) {
						searchService.setSort(_params.sortdir);
					} else {
						searchService.setSort('desc');  //TODO default is missing?
					}
				}

				_page = 1;
				_doSearch();
			}
		});

		$scope.$on('filterChanged', function (event, args) {
			searchViewService.setViewChanged(false);
			$scope.resetTable = false;
			if(args && args.refresh === false) {
				return;
			}
			if (!_initializing) {
				searchScroll.setPosition(0);
				_page = 1;
				_params = $location.search();
				var view = _params.view;
				var switched = $scope.switchView(view);
				if(switched && view !== 'table') {  //table view controller will fire its own search when initializing (changing views)
					$timeout(function() {  //let the scope digest after updating view
						_doSearch();
					});
				} else if (!switched) {
					//still in card or table view so table view controller won't initialize and fire a search, fire it
					$timeout(function() {  //let the scope digest after updating view
						_doSearch();
					});
				}
				//disp config can change after running a saved search
				var showMap = configService.showMap();
				if(showMap !== $scope.pageFramework.showMap) {
					$scope.showMap = showMap;
					_setPageClass();
				}
			}
		});

		$scope.$on('updateBBox', function(){
			$location.search('id', null);
			$location.search('recent', null);
			$location.search('pg', null);
			$scope.$emit('filterEvent', {});
		});

		$scope.$on('updateSearchSaveStatus', function(events, args){
			$location.search('id', args.id);
		});

		$scope.$watch('sortField', function(){
			if (!_initializing) {
				$location.search('sort', $scope.sortField);
				searchService.setSortField($scope.sortField);
				_page = 1;
				if(!_searching) {  //don't do this if within a search
					searchScroll.setPosition(0);
					_doSearch();
				}
			}
		});

		function _setCartState(items, docs) {
			var itemMap = _.indexBy(items,'id');
			$.each(docs, function(index, item) {
				if(itemMap[item.id]) {
					item.inCart = true;
				}
			});
		}

		$scope.hasResults = function () {
			return $scope.totalItems && $scope.totalItems > 0;
		};

		$scope.hasPermission = function(permission) {
			return authService.hasPermission(permission);
		};
        $scope.hasOnePermission = function() {
            return $scope.canEditPermission() || $scope.flagPermission() || $scope.canCart();
        };

        $scope.canEditPermission = function() {
            return !hasRemoteShard() && $scope.hasPermission('edit_fields');
        };
		function hasRemoteShard() {
			var shards = $location.search().shards;
			if (angular.isDefined(shards)) {
				if (shards.indexOf(',') !== -1) {
					return true;
				} else if (shards.toLowerCase() !== 'local') {
					return true;
				}
			}
			return false;
		}

        $scope.flagPermission = function() {
            return !hasRemoteShard() && $scope.hasPermission('flag');
        };

		$scope.exportPermission = function() {
			return $scope.hasPermission('export');
		};

        $scope.canCart = function () {
            return !hasRemoteShard() && $scope.hasPermission('process');
        };

        $scope.addToCart = function (item) {
            cartService.addItem(item);
            $analytics.eventTrack('addToList', {
                category: 'results', label: 'table' // jshint ignore:line
            });
        };

        $scope.addAllToCart = function() {
            $scope.isCartOpen = false;
            var query = cartItemsQuery.getQueryCriteria($location.search());
            query.count = $scope.totalItems;
            cartService.replace(query);
            $scope.$emit('addAllToCartEvent',{});
        };

		$scope.flagAllResults = function() {
			var modal = searchModalService.flagModal('src/bulk-update/flag-all.html', 'FlagAllCtrl', $scope.totalItems);
			modal.result.then(function () {
				_doSearch();
			});
		};

		$scope.removeAllFlags = function() {
			var modal = searchModalService.flagModal('src/bulk-update/remove-flag-all.html', 'RemoveAllFlagsCtrl');
			modal.result.then(function () {
				_doSearch();
			});
		};

        $scope.editAllPresentation = function() {
			var modal = searchModalService.editAllPresentation($scope.totalItems);
			modal.result.then(function () {
				_doSearch();
			});
		};

        $scope.exportResultsList = function() {
            searchModalService.exportResultsList($scope);
        };
        
        //Handle search result with error
        $scope.hideResultErrorMessage = function($event) {
            $event.preventDefault();
            $scope.resultError = false;
            _setPageClass();
        };
        
		$scope.showResultErrorTrace = function() {
			searchModalService.showResultErrorTrace($scope.resultStackTrace);
		};

        $scope.removeFromCart = function (id) {
            cartService.remove(id);
            $analytics.eventTrack('removeFromList', {
                category: 'results', label: 'table' // jshint ignore:line
            });
        };

        $scope.inCart = function (doc) {
            return cartService.isInCart(doc.id);
        };

        $scope.toggleSave = function() {
            savedSearchService.showSaveSearchDialog(_params);
        };

        $scope.toggleFilter = function() {
            $scope.filterVisible = !$scope.filterVisible;

            if($scope.filterVisible) {
                urlUtil.updateParam('filter', 'true', 'true');
                $location.search('filter','true');
            } else {
                $location.search('filter',null);
                urlUtil.removeParam('filter', 'true');
            }
            _setPageClass();
        };

        $scope.hideSearchError = function($event) {
            $event.preventDefault();
            $scope.searchError = false;
            _setPageClass();
        };
        
		function _setPageClass() {
			var _pageClass = searchViewService.getPageClass($scope.filterVisible, $scope.view, $scope.pageFramework.showMap, $scope.searchError, $scope.resultError);
			$scope.mapWrapperClass = _pageClass.mapWrapperClass;
			$scope.mapContentClass = _pageClass.mapContentClass;
			$scope.headerClass = _pageClass.headerClass;
			$scope.listViewClass = _pageClass.listViewClass;
		}

		$scope.changeSortDirection = function (direction) {
			if (searchService.getSort() !== direction && !_initializing) {
				searchScroll.setPosition(0);
				// if sort param has sort direction, use it instead of sortdir
				var currentSort = $location.search().sort;
				if(angular.isDefined(currentSort) && currentSort.indexOf(' ') !== -1) {
					var sortInfo = currentSort.split(' ');
					sortInfo[1] = direction;
					$location.search('sort', sortInfo.join(' '));
				} else {
					$location.search('sortdir',direction);
				}
				searchService.setSort(direction);
				_page = 1;
				_doSearch();
			}
		};

		$scope.changeSort = function(field) {
			searchScroll.setPosition(0);
			$scope.displaySortField = field.value;
			$scope.sortField = field.key;
		};

		$scope.checkDownload = function($event, doc) {
			if (!doc.hasDownload) {
				$event.preventDefault();
			}
		};

		$scope.switchView = function(view) {
			if ($scope.view !== view) {
				searchScroll.setPosition(0);
				_setView(view);
				return true;
			}
			return false;
		};

		//TODO this is on card but also needed for table view - move to results controller?
		$scope.addToMap = function(doc) {
			doc.isopen = false;

			if(doc.isService) {
				$scope.mapInfo = doc;
				$scope.$broadcast('addToMap', doc);
			}
		};

		$scope.showOnMap = function(doc) {
			doc.isopen = false;

			if(doc.isService) {
				$scope.mapInfo = doc;
				var webMapSettings = {webMap:config.mapApp, urls:[doc.fullpath], back:$location.absUrl()};
				localStorageService.add('web-map-settings', webMapSettings);
				$window.location.href = 'map.html';
				//TODO this isn't right
			}
		};

		$scope.toggleMap = function() {
			var newSetting = searchViewService.changeMapSize($scope.mapSize);
			$scope.bigMap = newSetting.bigMap;
			$scope.mapClass = newSetting.mapClass;
			$scope.mapSize = newSetting.mapSize;
		};

		function _bannerAdjust(view) {
			if(!_bannerAdjusted && view === 'table') {
				_bannerAdjusted = true;
				$timeout(function() {
					var banner = angular.element('#top-banner');
					if (banner.length > 0) {
						var bannerHeight = banner.height();
						var mapContent = angular.element('.map_content');
						mapContent.offset({top:  mapContent.offset().top + bannerHeight});
					}
				});
			} else {
				var mapContent = angular.element('.map_content');
				mapContent.css('top', '');
				_bannerAdjusted = false;
			}
		}

		function _setView(view, doSearch) {
			var currentView = $scope.view;
			$scope.view = angular.isUndefined(view) ? 'card' : view;
			_page = 1;

			$location.search('view', $scope.view);
			_bannerAdjust(view);
			if (view === 'table') {
				searchService.setItemsPerPage(50);
			} else {
				searchService.setItemsPerPage(48);
				if(doSearch === true) {
					_doSearch(_page);
				}
			}

			urlUtil.updateParam('view', currentView, $scope.view);

			_setPageClass();
		}

		$scope.$on('changeView', function (event, args) {
			if (!_initializing) {
				// reset the sort
				_params = $location.search();
				searchService.setSortField(_params.sort);
				searchService.setSort(_params.sortdir);
				searchScroll.setPosition(0);
				var doSearch = args && args.search === true;
				_setView(_params.view, doSearch);
			}
		});

		$scope.$watch('view', function () {
			_params = $location.search();
			_setView(_params.view, _initializing);
		});

		$scope.switchMap = function(size) {
			if ($scope.tableViewMapSize !== size) {
				$scope.tableViewMapSize = size;
				$location.search('mapsize', size);
			}
		};

		$scope.$on('mapSizeChanged', function(event, size){
			$scope.switchMap(size);
		});

		$scope.clearSearch = function() {
			filterService.clear();
			searchService.reset();
			$location.search('');
			_page = 1;
			_doSearch();
		};

		$scope.$on('clearSearch', function() {
			$scope.resetTable = true;
			searchService.reset();
		});

		function _loadNextChunk($scope) {
			_page += 1;
			_busy = true;

			searchScroll.setItemsPerPage();
			searchService.setPage(_page);
			_params = $location.search();
			searchService.doSearch2(_params, true).then(function(res) {
				var docs = res.data.response.docs;
				checkFederations(res);
				_syncCartState(docs).then(function() {
					if (docs.length > 0) {
						$.merge($scope.results, docs);
					} else {
						$scope.eof = true;
					}
					res.data.response.docs = $scope.results;
					res.data.scrolled = true;

					$scope.$emit('searchComplete',res.data);
					_busy = false;
					//usSpinnerService.stop('scroll-spinner');
				});
			}, function(res) {
				_handleSearchError(res);
			});
		}

        function _windowScroll() {
            //console.log('scrolling');
            inView.clear();
            inView.notify();
            if ($location.path().indexOf('/search') !== -1) {  //only do on search page
                //if ($scope.view !== 'table') {
                var windowEl = angular.element($window);
                //console.log ('scrolltop + height ' + (windowEl.scrollTop() + windowEl.height()) + ' doc height ' + $document.height());
                if ((windowEl.scrollTop() + windowEl.height() >= $document.height() - 200) && _busy === false && !$scope.eof) {
                    //fire when nearly reached bottom (-200) some browser seem to never reach absolute bottom (scrolltop + height)
                    usSpinnerService.spin('scroll-spinner');
                    _loadNextChunk($scope);
                }
                //TODO used timeout to wait until they stopped scrolling
                //$timeout.cancel(_scrollTimer);
                //_scrollTimer = $timeout(function() {
                    //stopped scrolling
                searchScroll.setPosition(windowEl.scrollTop());
                inView.check();
                inView.notify();
                //}, 0);

                $scope.$apply();
            }
        }

        angular.element($window).bind('scroll', _windowScroll);

        $scope.$on('$destroy', function() {
            angular.element($window).unbind('scroll', _windowScroll);
            inView.reset();
			authService.removeObserver(_reloadResults);
        });

		$scope.hoverIn = function(doc){
			doc.hoverShow = true;
		};

		$scope.hoverOut = function(doc){
			doc.hoverShow = false;
		};

		$scope.applyTag = function(tag) {
			tagService.applyTag(tag, $scope, filterService);
		};

    });
