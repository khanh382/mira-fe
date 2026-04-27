import axios from "axios"
import { getPublicApiOrigin } from "@/utils/publicApiOrigin"

const axiosClient = axios.create({
  baseURL: "",
  withCredentials: true,
})

axiosClient.interceptors.request.use((config) => {
  const origin = getPublicApiOrigin();
  config.baseURL = origin ? `${origin}/api/v1` : "";
  return config;
});

axiosClient.interceptors.response.use(
  (response) => {
    return response
  },
  async (error) => {
    const originalRequest = error.config;
    
    if (error.response && error.response.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      
      try {
        // Gọi API refresh token với withCredentials
        await axios.post(`${getPublicApiOrigin()}/api/v1/users/refresh-token`, {}, {
          withCredentials: true,
        });   
        // Retry request gốc
        return axiosClient(originalRequest);
      } catch (refreshError) {
        console.warn("Refresh token failed:", refreshError);
      }
    } else if (error.code === "ERR_NETWORK") {
      console.warn("Máy chủ đang gặp sự cố !")
    }
    return Promise.reject(error)
  },
)

export default axiosClient