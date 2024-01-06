import { AxiosResponse } from "axios";
declare const findAxiosResponseCookie: (r: AxiosResponse, cookieName: string) => string | undefined;
export default findAxiosResponseCookie;
