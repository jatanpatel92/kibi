var expect = require('expect.js');
var ngMock = require('ngMock');
var savedDashboards = require('fixtures/kibi/saved_dashboards');
var datemath = require('ui/utils/dateMath');

var $rootScope;
var kibiTimeHelper;

function init(savedDashboardsImpl) {
  return function () {
    ngMock.module('app/dashboard', function ($provide) {
      $provide.service('savedDashboards', savedDashboardsImpl);
    });

    ngMock.module('kibana');

    ngMock.inject(function ($injector, Private, _$rootScope_) {
      $rootScope = _$rootScope_;
      kibiTimeHelper = Private(require('ui/kibi/helpers/kibi_time_helper'));
    });
  };
}

describe('Kibi Components', function () {
  describe('KibiTimeHelper', function () {
    beforeEach(init(savedDashboards));

    it('do not modify because dashboard timeRestore == false', function (done) {
      var dashboardId = 'time-testing-1';
      var timeRangeFilter = {
        range: {
          time_field: {
            gte: '967996747755',
            lte: '1441295947756'
          }
        }
      };

      kibiTimeHelper.updateTimeFilterForDashboard(dashboardId, timeRangeFilter).then(function (updatedTimeRangeFilter) {
        expect(updatedTimeRangeFilter).to.eql(timeRangeFilter);
        done();
      });
      $rootScope.$apply();
    });

    it('modify because dashboard timeRestore == true', function (done) {
      var dashboardId = 'time-testing-2';
      var timeRangeFilter = {
        range: {
          time_field: {
            gte: datemath.parse('now-10y').valueOf(),
            lte: datemath.parse('now-1y').valueOf()
          }
        }
      };

      var expected = {
        range: {
          time_field: {
            gte: datemath.parse('now-15y').valueOf(),  // here we expect now-15y and now
            lte: datemath.parse('now').valueOf()       // because dashboard time-testing-2 has these values
          }
        }
      };

      kibiTimeHelper.updateTimeFilterForDashboard(dashboardId, timeRangeFilter).then(function (updatedTimeRangeFilter) {
        var gteDiff = updatedTimeRangeFilter.range.time_field.gte - expected.range.time_field.gte;
        var lteDiff = updatedTimeRangeFilter.range.time_field.lte - expected.range.time_field.lte;
        // we give a margin as computing these values might take
        // few miliseconds on a busy test server
        expect(gteDiff).to.be.within(0, 50);
        expect(lteDiff).to.be.within(0, 50);
        done();
      });
      $rootScope.$apply();
    });
  });
});




