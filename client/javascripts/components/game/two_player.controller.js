(()=>{
  angular.module('two_player.controller', [])
    .controller('TwoPlayerGame', TwoPlayerGame)
    .directive('compile', compile);
    
  //***************************************************************************
  // NOT MY CODE!! check out: https://github.com/angular/angular.js/issues/4992
  //***************************************************************************
  compile.$inject = ['$compile'];
  function compile($compile) {
    // directive factory creates a link function
    return function(scope, element, attrs) {
      scope.$watch(
        function(scope) {
          // watch the 'compile' expression for changes
          return scope.$eval(attrs.compile);
        },
        function(value) {
          // when the 'compile' expression changes assign it into the current DOM
          element.html(value);
          // compile the new DOM and link it to the current scope.
          // NOTE: we only compile .childNodes so that we don't get into infinite loop compiling ourselves
          $compile(element.contents())(scope);
        }
      );
    };
  };
  //***************************************************************************
    // END
  //***************************************************************************

  TwoPlayerGame.$inject = ['$scope', '$window', '$timeout', '$location', '$ngBootbox', '$anchorScroll', 'Socket', 'UserService'];
  function TwoPlayerGame($scope, $window, $timeout, $location, $ngBootbox, $anchorScroll, Socket, UserService){
    // For two players, the option to pause the game doesn't exist so vm.time is same for both
    let vm = this;
    vm.players = [];
    vm.time = 0;
    vm.timerRunning = false;
    vm.gameType = '2';

    vm.quitGame = function(){
      $ngBootbox.confirm('Are You Sure?').then(()=>{
        Socket.removeAllListeners();
        $location.path('/play');
      });
    };

    Socket.connect().emit('Setup Two Player Game');

    Socket.on('Player Join', ()=>{
      Socket.emit('Check Game Status');
    });

    Socket.on('Ready To Play', ids=>{
      vm.players.push(new Player(ids[0]), new Player(ids[1]));
    });

    Socket.on('Room Full', ()=>{
      $ngBootbox.alert('Sorry :( please try again at another time').then(()=>{
        Socket.removeAllListeners();
        $location.path('/play');
      });
    });
    
    Socket.on('Error', data=>{
      $ngBootbox.alert('An Error Has Occurred', ()=>{
        console.log(data);
      });
    });

    $scope.$on('$locationChangeStart', e=>{
      Socket.disconnect(true);
    });
  }

  function Player(socketId){
    this.socketId = socketId;
    this.clicks= 0;
    this.points= 0;
    this.articles= [];
    this.isPlaying= false;
    this.isLoading= false;
    this.isWin= false;
  }

  function Stat(vm){
    this.username = vm.currentUser.username;
    this.id = vm.currentUser.id;
    this.path = vm.articles.map(article => article.title).join(' -> ');
    this.score = {
      user_id: vm.currentUser.id,
      points: vm.points,
      time: vm.time,
      clicks: vm.clicks,
      game_type: vm.gameType,
      result: vm.points ? 'win' : 'lose'
    };
  }
})();