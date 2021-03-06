'use strict';

describe('Controller: EditAllCtrl', function () {

    var $scope, $timeout, $uibModal, usSpinnerService, $location, $http, $controller;
    var cfg = _.clone(config);

    beforeEach(function () {
        module('voyager.search');
        module('voyager.tagging');
        module('ui.bootstrap');
        module('voyager.config');
        module(function ($provide) {
            $provide.constant('config', cfg);
        });

        inject(function (_$controller_, _$timeout_, _$uibModal_, _usSpinnerService_, _$location_, $httpBackend) {
            $scope = {};
            $timeout = _$timeout_;
            $uibModal = _$uibModal_;
            usSpinnerService = _usSpinnerService_;
            $location = _$location_;
            $http = $httpBackend;
            $controller = _$controller_;
        });

    });

    // Specs here

    it('should init', function () {
        $controller('EditAllCtrl', {$scope: $scope, $uibModalInstance: {}, resultTotalCount: 1});
        $http.expectJSONP(new RegExp('usertags')).respond({facet_counts:{facet_fields:{fss_tag_tags:['tag']}}});
        $http.flush();

        expect($scope.select2Options.tags).toEqual(['tag']);
    });

    it('should validate', function () {
        $controller('EditAllCtrl', {$scope: $scope, $uibModalInstance: {}, resultTotalCount: 1});
        $http.expectJSONP(new RegExp('usertags')).respond({facet_counts:{facet_fields:{fss_tag_tags:['tag']}}});
        $http.flush();

        expect($scope.validate()).toBeFalsy();

        $scope.fieldText = 'fieldText';
        $scope.selectedField = 'selected';

        expect($scope.validate()).toBeTruthy();
    });

    it('should save all', function () {
        $controller('EditAllCtrl', {$scope: $scope, $uibModalInstance: {close:function(){}}, resultTotalCount: 1});
        $http.expectJSONP(new RegExp('usertags')).respond({facet_counts:{facet_fields:{fss_tag_tags:['tag']}}});
        $http.flush();

        $scope.fieldText = 'fieldText';
        $scope.selectedField = 'selected';

        $scope.save();

        $http.expectPOST(new RegExp('usertag')).respond({tagging:''});
        $http.flush();

        $timeout.flush();
    });

});