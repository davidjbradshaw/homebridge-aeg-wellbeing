import axios from 'axios';
import createAuthRefreshInterceptor from 'axios-auth-refresh';

const baseUrl = 'https://api.delta.electrolux.com/api';
const clientUrl =
  'https://electrolux-wellbeing-client.vercel.app/api/mu52m5PR9X';

const contentType = {
  'Content-Type': 'application/json',
}

const fetchClientToken = async () => {
  const response = await axios.get(clientUrl, {
    headers: contentType,
  });

  return response.data.accessToken;
};

const doLogin = async ({ username, password, clientToken }) =>
  axios.post(
    `${baseUrl}/Users/Login`,
    {
      Username: username,
      password,
    },
    {
      headers: {
        ...contentType,
        Authorization: `Bearer ${clientToken}`,
      },
    },
  );

export default async ({ username, password }) => {
  const clientToken = await fetchClientToken();
  const response = await doLogin({
    username,
    password,
    clientToken,
  });
  const { accessToken } = response.data;

  const client = axios.create({
    baseURL: baseUrl,
    headers: {
      ...contentType,
      Authorization: `Bearer ${accessToken}`,
    },
  });

  createAuthRefreshInterceptor(
    client,
    (failedRequest) =>
      doLogin({
        username,
        password,
        clientToken,
      }).then((tokenRefreshResponse) => { // eslint-disable-line promise/always-return
        client.defaults.headers.common.Authorization = `Bearer ${tokenRefreshResponse.data.accessToken}`;
        // eslint-disable-next-line no-param-reassign
        failedRequest.response.config.headers.Authorization = `Bearer ${tokenRefreshResponse.data.accessToken}`;
      }),
    {
      statusCodes: [400, 401, 403, 408, 429, 500, 502, 503, 504],
    },
  );

  return client;
};

