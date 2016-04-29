const _ = require('lodash');
const debug = require('debug')('push2cloud-compiler-cf-app-connections');
const underscored = require('underscore.string/underscored');

const upper = (str) => underscored(str).toUpperCase();

const appConnections = (config, mani, t, next) => {
  debug('creating the app connections...');

  const envVars = _.map(config.apps, (app) => {
    debug('for ' + app.name);

    const maniApp = t.findApp(app.name);
    const connections = (mani.deployment.apps
                      && mani.deployment.apps[app.unversionedName || app.name]
                      && mani.deployment.apps[app.unversionedName || app.name].appConnections)
                      ? mani.deployment.apps[app.unversionedName || app.name].appConnections
                      : maniApp.deployment.appConnections;
    const appEnvVar = t.findEnvVars(app.name);

    const conns = _.isEmpty(connections) ? appEnvVar :
      _.reduce(connections
      , (acc, connection, toApp) => {
        // pro connection
        //TODO: add error handling if domain not found

        if (!connection.domain) {
          if (maniApp.deployment.routes && _.keys(maniApp.deployment.routes).length > 0) {
            connection.domain = _.keys(maniApp.deployment.routes)[0];
          } else if (mani.deployment.apps[toApp].routes && _.keys(mani.deployment.apps[toApp].routes).length > 0) {
            connection.domain = _.keys(mani.deployment.apps[toApp].routes)[0];
          }
        }

        var routes = maniApp.deployment.routes ? maniApp.deployment.routes[connection.domain] : null;
        if (!routes && mani.deployment.apps && mani.deployment.apps[toApp]) {
          routes = mani.deployment.apps[toApp].routes ? mani.deployment.apps[toApp].routes[connection.domain] : null;
        }

        if (!routes || routes.length === 0) {
          debug(`No route found to ${toApp}!`);
          if (t.isExcluded(toApp)) {
            debug(`App ${toApp} excluded!`);
            return acc;
          }

          return next(new Error(`Route to ${toApp} not found!`));
        }

        const route = routes[0]; // at the moment just take the first?
        var proto = 'http://';
        if (connection.secure === true || connection.secure === false) {
          if (connection.secure) proto = 'https://';
        } else if (mani.deployment.secureAppConnections) {
          proto = 'https://';
        }

        const urlTemplate = _.template(proto + route + '.' + mani.deployment.domains[connection.domain]);

        const toAppMani = t.findApp(toApp);
        if (!toAppMani) {
          if (t.isExcluded(toApp)) {
            debug(`App ${toApp} excluded!`);
            return acc;
          }

          return next(new Error(`App ${toApp} not found!`));
        }

        const url = urlTemplate(_.assign({}, toAppMani, { appname: toAppMani.name, org: mani.deployment.target.org, space: mani.deployment.target.space }));

        acc.env[upper(toApp) + '_HOST'] = url;

        if (connection.urls) {
          _.forEach(connection.urls, (value, key) => {
            acc.env[key] = url + value;
          });
        }

        const toAppEnvVars = t.findEnvVars(toApp);

        if (connection.injectCredentials) {
          if (toAppEnvVars.env.USERNAME) acc.env[upper(toApp) + '_USERNAME'] = toAppEnvVars.env.USERNAME;
          if (toAppEnvVars.env.PASSWORD) acc.env[upper(toApp) + '_PASSWORD'] = toAppEnvVars.env.PASSWORD;
        }

        const autoEnv = _.mapKeys(mani.deployment.autoEnvReplacement, (value, key) => key.replace('${APPNAME}', upper(toApp)));
        acc.env = _.assign({}, acc.env, autoEnv);

        /*const urls = _.reduce(connection.urls , (accUrls, postfix, key) => {
                               accUrls[upper(toApp) + key] = url + postfix;
                               return accUrls;
                             }, {});
        _.merge(acc.env, urls);*/
        return acc;
      }, appEnvVar);
    return conns;
  });

  next(null, _.assign({}, config, { envVars: _.compact(envVars) }), mani, t);
};

module.exports = appConnections;
