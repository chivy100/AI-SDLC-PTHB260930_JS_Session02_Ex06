// 1. TẠO AXIOS INSTANCE
function createShopHttp(timeoutMs = 5000) {
  const http = axios.create({
    baseURL: BASE_URL,
    timeout: timeoutMs,
    headers: {
      Accept: "application/json",
    },
  });

  // Đọc token tại thời điểm gửi request, không đọc lúc tạo instance
  http.interceptors.request.use((config) => {
    const token = shopSession.token;

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    return config;
  });

  // Trả dữ liệu server trực tiếp và chuẩn hóa lỗi
  http.interceptors.response.use(
    (response) => response.data,

    (error) => {
      let status;
      let message;
      let body = null;

      if (
        error.code === "ECONNABORTED" ||
        error.code === "ETIMEDOUT"
      ) {
        status = 408;
        message = `Yêu cầu quá thời gian chờ ${timeoutMs}ms.`;
      } else if (error.response) {
        status = error.response.status;
        body = error.response.data;

        // Riêng lỗi đăng nhập sai thông tin
        if (
          status === 400 &&
          error.config?.url?.includes("/auth/login")
        ) {
          message = "Sai tên đăng nhập hoặc mật khẩu.";
        } else {
          message = messageForStatus(status);
        }
      } else {
        // Lỗi mạng: không nhận được response từ server
        status = 0;
        message = messageForStatus(0);
      }

      return Promise.reject(new ApiError(status, message, body));
    }
  );

  return http;
}

// 2. LƯU TOKEN
function setToken(token) {
  shopSession.token = token;
}

// 3. LẤY TOKEN
function getToken() {
  return shopSession.token;
}

// 4. ĐĂNG NHẬP
async function login(username, password) {
  // Kiểm tra dữ liệu trước khi gọi API
  if (!username || !password) {
    throw new ApiError(
      400,
      "Vui lòng nhập tên đăng nhập và mật khẩu.",
      null
    );
  }

  const http = createShopHttp();

  const data = await http.post("/auth/login", {
    username,
    password,
  });

  // Lưu accessToken để các request tiếp theo tự động sử dụng
  setToken(data.accessToken);

  return data;
}

// 5. LẤY THÔNG TIN NGƯỜI DÙNG HIỆN TẠI
async function getMe() {
  // Không có token thì không gửi request
  if (!getToken()) {
    throw new ApiError(
      401,
      messageForStatus(401),
      null
    );
  }

  const http = createShopHttp();

  return await http.get("/auth/me");
}

// 6. LẤY DANH SÁCH SẢN PHẨM
async function getProducts({ limit, skip, q, category } = {}) {
  const http = createShopHttp();

  // Chỉ thêm những tham số thực sự được truyền vào
  const params = {};

  if (limit !== undefined) {
    params.limit = limit;
  }

  if (skip !== undefined) {
    params.skip = skip;
  }

  // Ưu tiên tìm kiếm theo từ khóa nếu có cả q và category
  if (q) {
    params.q = q;

    return await http.get("/products/search", { params });
  }

  // Nếu không có q thì mới lọc theo category
  if (category) {
    return await http.get(
      `/products/category/${encodeURIComponent(category)}`,
      { params }
    );
  }

  // Không có q và category thì lấy tất cả sản phẩm
  return await http.get("/products", { params });
}

// 7. LẤY CHI TIẾT SẢN PHẨM
async function getProduct(id) {
  const http = createShopHttp();

  return await http.get(`/products/${id}`);
}

// 8. THANH TOÁN
async function checkout({ username, password, items } = {}) {
  // Kiểm tra giỏ hàng trước khi thực hiện bất kỳ request nào
  if (!Array.isArray(items) || items.length === 0) {
    throw new ApiError(
      400,
      "Giỏ hàng trống: cần ít nhất một sản phẩm.",
      null
    );
  }

  // Kiểm tra số lượng từng sản phẩm
  for (const item of items) {
    if (
      !Number.isInteger(item.quantity) ||
      item.quantity <= 0
    ) {
      throw new ApiError(
        400,
        "Số lượng phải là số nguyên dương.",
        null
      );
    }
  }

  // Bước 1: Đăng nhập và lấy thông tin người dùng
  const user = await login(username, password);

  // Bước 2: Tạo giỏ hàng
  const http = createShopHttp();

  const cart = await http.post("/carts/add", {
    userId: user.id,
    products: items.map((item) => ({
      id: item.productId,
      quantity: item.quantity,
    })),
  });

  // Bước 3: Lấy lịch sử các giỏ hàng của người dùng
  const previousCartsResponse = await http.get(
    `/carts/user/${user.id}`
  );

  // Một số API trả danh sách trong thuộc tính carts
  const previousCarts =
    previousCartsResponse.carts ?? previousCartsResponse;

  return {
    user: {
      id: user.id,
      username: user.username,
    },
    cart,
    previousCarts,
  };
}

// 9. TEST CASE: setToken()

console.log("===== TEST setToken() =====");

// Test 1: Lưu token
setToken("test-access-token");

console.log(getToken());
// Expected: "test-access-token"

// Test 2: Gỡ token
setToken(null);

console.log(getToken());
// Expected: null


// 10. TEST CASE: getToken()

console.log("===== TEST getToken() =====");

setToken("abc123");

console.log(getToken());
// Expected: "abc123"

setToken(null);

console.log(getToken());
// Expected: null


// 11. TEST CASE: createShopHttp()

console.log("===== TEST createShopHttp() =====");

// Test 1: Tạo Axios instance với timeout mặc định
const httpDefault = createShopHttp();

console.log(httpDefault.defaults.baseURL);
// Expected: BASE_URL

console.log(httpDefault.defaults.timeout);
// Expected: 5000

console.log(httpDefault.defaults.headers.Accept);
// Expected: "application/json"

// Test 2: Tạo Axios instance với timeout tùy chỉnh
const httpCustom = createShopHttp(3000);

console.log(httpCustom.defaults.timeout);
// Expected: 3000


// 12. TEST CASE: login()

console.log("===== TEST login() =====");

async function testLogin() {
  // Test 1: Đăng nhập thành công
  resetShopSession();

  try {
    const user = await login("michaelw", "michaelwpass");

    console.log(user);
    // Expected: Dữ liệu người dùng có id, username, accessToken

    console.log(getToken());
    // Expected: Token được lưu sau khi đăng nhập thành công
  } catch (error) {
    console.log(error);
    // Expected: Không có lỗi nếu thông tin đăng nhập hợp lệ
  }

  // Test 2: Thiếu username
  resetShopSession();

  try {
    await login("", "michaelwpass");
  } catch (error) {
    console.log(error.status);
    // Expected: 400

    console.log(error.message);
    // Expected: "Vui lòng nhập tên đăng nhập và mật khẩu."
  }

  // Test 3: Thiếu password
  resetShopSession();

  try {
    await login("michaelw", "");
  } catch (error) {
    console.log(error.status);
    // Expected: 400

    console.log(error.message);
    // Expected: "Vui lòng nhập tên đăng nhập và mật khẩu."
  }

  // Test 4: Sai thông tin đăng nhập
  resetShopSession();

  try {
    await login("wrong-user", "wrong-password");
  } catch (error) {
    console.log(error.status);
    // Expected: 400

    console.log(error.message);
    // Expected: "Sai tên đăng nhập hoặc mật khẩu."
  }
}

testLogin();


// 13. TEST CASE: getMe()

console.log("===== TEST getMe() =====");

async function testGetMe() {
  // Test 1: Không có token
  resetShopSession();

  try {
    await getMe();
  } catch (error) {
    console.log(error.status);
    // Expected: 401

    console.log(error.message);
    // Expected: messageForStatus(401)
  }

  // Test 2: Có token hợp lệ
  resetShopSession();

  try {
    await login("michaelw", "michaelwpass");

    const user = await getMe();

    console.log(user);
    // Expected: Thông tin người dùng hiện tại
  } catch (error) {
    console.log(error);
    // Expected: Không có lỗi nếu token hợp lệ
  }
}

testGetMe();


// 14. TEST CASE: getProducts()

console.log("===== TEST getProducts() =====");

async function testGetProducts() {
  // Test 1: Lấy toàn bộ sản phẩm
  try {
    const result = await getProducts();

    console.log(result);
    // Expected: Danh sách sản phẩm
  } catch (error) {
    console.log(error);
  }

  // Test 2: Phân trang
  try {
    const result = await getProducts({
      limit: 10,
      skip: 10,
    });

    console.log(result);
    // Expected: Tối đa 10 sản phẩm, bỏ qua 10 sản phẩm đầu
  } catch (error) {
    console.log(error);
  }

  // Test 3: Tìm kiếm sản phẩm
  try {
    const result = await getProducts({
      q: "phone",
      limit: 10,
    });

    console.log(result);
    // Expected: Kết quả tìm kiếm sản phẩm theo từ khóa
  } catch (error) {
    console.log(error);
  }

  // Test 4: Lọc theo category
  try {
    const result = await getProducts({
      category: "smartphones",
      limit: 10,
    });

    console.log(result);
    // Expected: Danh sách sản phẩm thuộc category smartphones
  } catch (error) {
    console.log(error);
  }

  // Test 5: Có cả q và category
  try {
    const result = await getProducts({
      q: "phone",
      category: "smartphones",
    });

    console.log(result);
    // Expected: Ưu tiên endpoint /products/search
  } catch (error) {
    console.log(error);
  }
}

testGetProducts();


// 15. TEST CASE: getProduct()

console.log("===== TEST getProduct() =====");

async function testGetProduct() {
  // Test 1: Lấy sản phẩm có ID hợp lệ
  try {
    const product = await getProduct(144);

    console.log(product);
    // Expected: Thông tin sản phẩm có ID 144
  } catch (error) {
    console.log(error);
  }

  // Test 2: ID không tồn tại
  try {
    await getProduct(999999);
  } catch (error) {
    console.log(error.status);
    // Expected: 404
  }
}

testGetProduct();


// 16. TEST CASE: checkout()

console.log("===== TEST checkout() =====");

async function testCheckout() {
  // Test 1: Checkout thành công
  resetShopSession();

  try {
    const result = await checkout({
      username: "michaelw",
      password: "michaelwpass",
      items: [
        {
          productId: 144,
          quantity: 4,
        },
        {
          productId: 98,
          quantity: 1,
        },
      ],
    });

    console.log(result);
    // Expected: Có user, cart và previousCarts

    console.log(result.user);
    // Expected: { id: 2, username: "michaelw" }

    console.log(result.cart);
    // Expected: Dữ liệu giỏ hàng vừa tạo

    console.log(result.previousCarts);
    // Expected: Lịch sử giỏ hàng của người dùng
  } catch (error) {
    console.log(error);
  }

  // Test 2: Giỏ hàng rỗng
  resetShopSession();

  try {
    await checkout({
      username: "michaelw",
      password: "michaelwpass",
      items: [],
    });
  } catch (error) {
    console.log(error.status);
    // Expected: 400

    console.log(error.message);
    // Expected: "Giỏ hàng trống: cần ít nhất một sản phẩm."
  }

  // Test 3: items không phải array
  resetShopSession();

  try {
    await checkout({
      username: "michaelw",
      password: "michaelwpass",
      items: {},
    });
  } catch (error) {
    console.log(error.status);
    // Expected: 400
  }

  // Test 4: Quantity bằng 0
  resetShopSession();

  try {
    await checkout({
      username: "michaelw",
      password: "michaelwpass",
      items: [
        {
          productId: 144,
          quantity: 0,
        },
      ],
    });
  } catch (error) {
    console.log(error.status);
    // Expected: 400

    console.log(error.message);
    // Expected: "Số lượng phải là số nguyên dương."
  }

  // Test 5: Quantity âm
  resetShopSession();

  try {
    await checkout({
      username: "michaelw",
      password: "michaelwpass",
      items: [
        {
          productId: 144,
          quantity: -1,
        },
      ],
    });
  } catch (error) {
    console.log(error.status);
    // Expected: 400
  }

  // Test 6: Quantity là số thập phân
  resetShopSession();

  try {
    await checkout({
      username: "michaelw",
      password: "michaelwpass",
      items: [
        {
          productId: 144,
          quantity: 1.5,
        },
      ],
    });
  } catch (error) {
    console.log(error.status);
    // Expected: 400
  }
}

testCheckout();