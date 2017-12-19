import {URL} from 'url';
import {Request, Response, NextFunction} from 'express';
import OAuth2Authentication from '@authentication/oauth2';
import {Mixed} from '@authentication/types';
import {Profile} from '@authentication/types';
// import parseProfile from './parseProfile';
// import GooglePlusAPIError from './errors/GooglePlusAPIError';
// import UserInfoError from './errors/UserInfoError';

export interface Options {
  clientID?: string;
  clientSecret?: string;
  callbackURL: string | URL;
  /**
   * Optionally provide keys to sign the cookie used to store "state"
   */
  cookieKeys?: string[];
  /**
   * Optionally override the default name for the cookie used to store "state"
   *
   * default: "authentication_oauth2"
   */
  cookieName?: string;
  trustProxy?: boolean;
}
export interface InitOptions<State> {
  /**
   * valid scopes include: 'user', 'public_repo', 'repo', 'gist', or none.
   * (see http://developer.github.com/v3/oauth/#scopes for more info)
   */
  scope?: string | ReadonlyArray<string>;
  state?: State;
}

const userProfileURL = new URL('https://api.github.com/user');
const userEmailsURL = new URL('https://api.github.com/user/emails');

export const DEFAULT_SCOPE = [
  // 'user',
];

/**
 * The GitHub authentication strategy authenticates requests by delegating to
 * GitHub using the OAuth 2.0 protocol.
 */
export default class GitHubAuthentication<State = Mixed> {
  static DEFAULT_SCOPE: ReadonlyArray<string> = DEFAULT_SCOPE;
  private readonly _oauth: OAuth2Authentication<State>;
  public readonly callbackPath: string;
  constructor(options: Options) {
    const clientID =
      options.clientID === undefined
        ? process.env.GITHUB_CLIENT_ID
        : options.clientID;
    const clientSecret =
      options.clientSecret === undefined
        ? process.env.GITHUB_CLIENT_SECRET
        : options.clientSecret;
    if (!clientID) {
      throw new Error(
        'You must either specify the `clientID` option when constructing GitHubAuthentication or set the GITHUB_CLIENT_ID environment variable.',
      );
    }
    if (!clientSecret) {
      throw new Error(
        'You must either specify the `clientSecret` option when constructing GitHubAuthentication or set the GITHUB_CLIENT_SECRET environment variable.',
      );
    }
    this._oauth = new OAuth2Authentication({
      clientID,
      clientSecret,
      cookieKeys: options.cookieKeys,
      cookieName: options.cookieName,
      authorizeURL: new URL('https://github.com/login/oauth/authorize'),
      accessTokenURL: new URL('https://github.com/login/oauth/access_token'),
      callbackURL: options.callbackURL,
      customHeaders: {'User-Agent': '@authenticate/github'},
      trustProxy: options.trustProxy,
    });
    this.callbackPath = this._oauth.callbackPath;
  }

  /**
   * Retrieve user profile from Google.
   *
   * This function constructs a normalized profile
   */
  async userProfile(accessToken: string): Promise<Profile> {
    let body = '';
    try {
      body = (await this._oauth.get(userProfileURL, accessToken)).data;
    } catch (err) {
      let json: any = null;
      if (err.data) {
        try {
          json = JSON.parse(err.data);
        } catch (_) {}
      }

      if (json && json.message) {
        throw new APIError(json.message);
      }
      throw new OAuth2Authentication.InternalOAuthError(
        'Failed to fetch user profile',
        err,
      );
    }

    let json = null;
    try {
      json = JSON.parse(body);
    } catch (ex) {
      throw new Error('Failed to parse user profile');
    }

    return `parseProfile`(json);
  }

  isCallbackRequest(req: Request) {
    return this._oauth.isCallbackRequest(req);
  }
  userCancelledLogin(req: Request) {
    return this._oauth.userCancelledLogin(req);
  }
  redirectToProvider(
    req: Request,
    res: Response,
    next: NextFunction,
    options: InitOptions<State> = {},
  ) {
    return this._oauth.redirectToProvider(req, res, next, {
      scope: options.scope || DEFAULT_SCOPE,
      state: options.state,
    });
  }
  async completeAuthentication(req: Request, res: Response) {
    const {
      accessToken,
      refreshToken,
      state,
    } = await this._oauth.completeAuthentication(req, res);
    const profile = await this.userProfile(accessToken);
    return {accessToken, refreshToken, profile, state};
  }
}

module.exports = GitHubAuthentication;
module.exports.default = GitHubAuthentication;
