import axios from "axios"

const apiUrl = process.env.NEXT_PUBLIC_API_URL;
const axiosClient = axios.create({
  baseURL: `${apiUrl}/api/v1`,
  withCredentials: true,
})

axiosClient.interceptors.request.use(
  (config) => {
    return config
  },
  (error) => {
    return Promise.reject(error)
  },
)
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
        await axios.post(`${apiUrl}/api/v1/users/refresh-token`, {}, {
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