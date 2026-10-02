const API_BASE_URL='http://123.207.245.251:3000';

function wxLogin(){
  return new Promise((resolve,reject)=>{
    wx.login({
      success(loginRes){
        if(!loginRes.code){
          reject('获取微信code失败');
          return;
        }

        wx.request({
          url:`${API_BASE_URL}/api/auth/login`,
          method:'POST',
          header:{
            'content-type':'application/json'
          },
          data:{
            code:loginRes.code
          },
          success(res){
            if(res.data.success){
              const user=res.data.data;
              wx.setStorageSync('USER_INFO',user);
              resolve(user);
            }else{
              reject(res.data.message);
            }
          },
          fail(err){
            reject(err);
          }
        })
      },
      fail(err){
        reject(err);
      }
    })
  })
}

function getUser(){
  return wx.getStorageSync('USER_INFO')||null;
}

module.exports={
  wxLogin,
  getUser
}