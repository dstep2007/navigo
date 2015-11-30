/*global angular */

angular.module('voyager.search').
	factory('searchModalService', function ($modal) {
		'use strict';

		return {
			exportResultsList: function(scope) {
				$modal.open({
					template: '<div><vs-export-results /></div>',
					size: 'md',
					scope: scope
				});
			},

			showResultErrorTrace: function(resultStackTrace) {
				$modal.open({
					templateUrl: 'src/results/result-error.html',
					controller: 'ResultErrorCtrl',
					size: 'lg',
					resolve: {
						resultStackTrace: function() {
							return resultStackTrace;
						}
					}
				});
			},

			flagModal: function(templateUrl, controller, totalItems) {
				return $modal.open({
					templateUrl: templateUrl,
					controller: controller,
					resolve: {
						resultData: function () {
							return {
								totalItemCount: totalItems
							};
						}
					}
				});
			},

			editAllPresentation: function(totalItems) {
				return $modal.open({
					templateUrl: 'src/bulk-update/edit-all.html',
					controller: 'EditAllCtrl',
					size: 'lg',
					resolve: {
						resultTotalCount: function() {
							return totalItems;
						}
					}
				});
			}

		};

	});