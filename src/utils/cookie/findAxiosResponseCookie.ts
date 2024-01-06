import { AxiosResponse } from "axios"

const findAxiosResponseCookie = (r: AxiosResponse, cookieName: string) => {
  return (r.headers["set-cookie"] as string[])
    .find((cookie) => cookie.includes(cookieName))
    ?.match(new RegExp(`^${cookieName}=(.+?);`))?.[1]
}

export default findAxiosResponseCookie
