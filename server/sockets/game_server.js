'use strict';
const cheerio = require('cheerio');
const rp = require('request-promise');
const helpers = require('../helpers/socketHelpers');
const BASE_URL = 'https://en.wikipedia.org';
const WIKILIST = '/wiki/Wikipedia:WikiProject_';
const _ = require('lodash');

// two player vars
let gametype = null;
let players = [];
let socketIds = [];

// TODO: find random category first. and within that category, select two articles
// get all categories from https://en.wikipedia.org/wiki/Portal:Contents/Categories
// pick a random category and attach to '/wiki/Special:RandomInCategory/${RANDOM}'
// if the resulting page is a category page, do the special random search again
  // example:
  // const RANDOM_PAGE = '/wiki/Special:RandomInCategory/Featured_articles';
  // start from https://en.wikipedia.org/wiki/Special:RandomInCategory/Companies
  // this results in https://en.wikipedia.org/wiki/Category:Companies_by_region
  // so do another search with https://en.wikipedia.org/wiki/Special:RandomInCategory/Companies_by_region
  // keep going until the query does not include ':'
// if the resulting path starts with 'List'
// if the query leads to an article, take out the # if it exists

exports.init = (io, socket)=>{
  console.log('CLIENT HANDSHAKE');
  //***************************************************************************
    // ONE PLAYER
  //***************************************************************************
  socket.on('Setup One Player Game', ()=>{
    gametype = '1';
    // get two random articles
    Promise.all([generateRandomTopic(), generateRandomTopic()])
      .then(topics=>{
        let titles = helpers.replaceInvalidTopics(
            helpers.findUniqueTopics(topics[0], topics[1])
          );
        return Promise.all([generateTitle(titles[0]), generateTitle(titles[1])]);
      })
      .then(titles=>{
        socket.emit('Receive Titles', titles);
      })
      .catch(err=>{
        socket.emit('Error', 'Failed To Retrieve Data');
      });
  });
  //***************************************************************************
    // END
  //***************************************************************************
  //***************************************************************************
    // TWO PLAYER
  //***************************************************************************
  socket.on('Setup Two Player Game', ()=>{
    // adding gametype flag to use interchangeable socket methods
    gametype = '2';

    if(socketIds.length < 2){
      socketIds.push(socket.client.id);
      socket.join('Wiki Room');
      io.to('Wiki Room').emit('Player Join', socket.client.id);
    }else{
      socket.emit('Room Full');
    }
  });

  socket.on('Check Game Status', player=>{
    if(socketIds.length === 2){
      players.push(player);
      console.log('Ready To Play', players);
      if(players.length === 2){
        io.to('Wiki Room').emit('Ready To Play', players);
      }
    }else{
      console.log('Not Ready', players);
      socket.emit('Not Ready');
    }
  }); 

  socket.on('Load Game', ()=>{
    // TODO: should refactor this into a function
    Promise.all([generateRandomTopic(), generateRandomTopic()])
      .then(topics=>{
        let titles = helpers.replaceInvalidTopics(
            helpers.findUniqueTopics(topics[0], topics[1])
          );
        return Promise.all([generateTitle(titles[0]), generateTitle(titles[1])]);
      })
      .then(titles=>{
        console.log(titles);
        io.to('Wiki Room').emit('Receive Titles', titles);  
      })
      .catch(err=>{
        socket.emit('Error', 'Failed To Retrieve Data');
      });
  });

  socket.on('Start Game', ()=>{
    socket.emit('Load First Article');
  });

  //***************************************************************************
    // END
  //***************************************************************************
  socket.on('Generate Article', PATH=>{
    let title, text, content, thumbnail, linkTags, styles, path = PATH;

    rp({uri: `${BASE_URL}${PATH}`, transform: body=>cheerio.load(body)})
      .then($=>{
        title = $('#firstHeading').html();
        text = $('#firstHeading').text();

        thumbnail = $('#mw-content-text .infobox .image img').attr('src');
        
        content = $('#bodyContent').html()
          .replace(/href=('|"|‘|’|“|”).+?('|"|‘|’|“|”)/g, match=>{
            return processLinks(match);
          });

        linkTags = $("link[rel='stylesheet']").map((idx, elem)=>{
          return rp(`${BASE_URL}${elem.attribs.href}`);
        }).get();        

        return Promise.all(linkTags);
      })
      .then(stylesheets=>{
        styles = stylesheets.join('');
        socket.emit('Receive Article', {title, text, content, thumbnail, styles, path});
      })
      .catch(err=>{
        socket.emit('Error', 'Failed To Retrieve Data');
      });
  });

  socket.on('Game Finished', ()=>{
    socket.emit('Evaluate Score');
  });

  socket.on('disconnect', ()=>{
    if(gametype === '2'){
      players = players.filter(player => player.socketId !== socket.client.id);
      socketIds.splice(socketIds.indexOf(socket.client.id), 1);
      socket.leave('Wiki Room');
      io.to('Wiki Room').emit('Player Leave');      
    }
    console.log('CLIENT DISCONNECT');
  });
};

// TODO: Put these in helpers file
//***************************************************************************
  // HELPERS
//***************************************************************************

function generateTitle(PATH){
  return rp({uri: `${BASE_URL}${PATH}`, transform: body=>cheerio.load(body)})
    .then($=>{
      return $('#firstHeading').text();
    })
    .catch(err=>{
      return err;
    });
}

function generateRandomTopic(){
  let uri = `${BASE_URL}${WIKILIST}${helpers.getRandomElement(helpers.topics())}/Popular_pages`;
  return rp({uri, transform: body=>cheerio.load(body)})
    .then($=>{
      let paths = $('.wikitable tr td:nth-child(2)').map((idx, elem)=>{
        return elem.children[0].attribs.href;
      }).get();

      return paths.length > 20 ? paths.slice(0, 20) : paths;
    })
    .catch(err=>{
      return err
    });  
}

// TODO: this does not work for this case: //species.wikimedia.org/wiki/Sitta_przewalskii
function processLinks(str){
  if(str.includes('/wiki/') && str.search(/(:|#|jpg|jpeg|png|gif)/) === -1){
    // regular links
    return `href='#' ng-click=vm.generateArticle('${str.substring(6, str.length-1)}')`;
  }else if(str.includes('#') && str.search(/(\/wiki\/|http)/) === -1){
    // anchor tags
    return `target='_self' class='wiki-clickable' ng-click=vm.onHashClick('${str.substring(7, str.length-1)}')`;
  }else{
    // disable everything else
    return "class='wiki-disabled'";
  }
}
