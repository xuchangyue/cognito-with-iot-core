# Cognito Identity Pool + IoT Core 实现 Mobile 端用户对设备权限的精细化控制

## 场景概述
目前，越来越多的Iot厂商会通过开发自己的APP，使得终端用户可以通过APP绑定自己的设备，检测自己设备的实时情况，并且对设备做即时的控制。在此场景下，从安全角度考虑，Mobile端的终端用户应该只能发布消息到自己的设备。用户和设备的关系可能是一对多或者多对多。在一对多的场景下，同一个user可能会有多个设备，例如设备device1和device2隶属于用户A，用户A只能发布消息到/userA/device1(or device2)/start的topic中，无权发布到/userB/xxxx的topic下；
而在多对多的场景，同一个设备可能在家庭或者办公公有，多人都应该有控制权限，如设备device2可以同时由用户B和C的手机APP进行控制，此时用户B和C都有权限发布消息到/device2/temp下。本文考虑到此两种场景并做展开，利用Cognito和AWS Iot Core，实现终端对设备的精细化控制权限管理。


## 架构图
![](https://salander.s3.cn-north-1.amazonaws.com.cn/public/cognito-with-iot-core/architecture.png)

通过cognito user pool，无需自己coding，即可轻松实现用户的注册、登录、注销等基本操作。Cognito Identity Pool可以与cognito user pool或是其他第三方账号(如google，facebook)做对接，利用IAM Role实现对AWS资源的精细化控制。本文同时使用cognito User Pool和cognito identity Pool，实现对Iot Core的访问管理。终端用户通过cognito user pool的用户池，获得登录token，通过此登录成功的token，可以拿到cognito Identity Pool Authorized Role的身份，使得他有权访问Iot Core。用户的登录ID和设备之间的绑定关系存储在NoSQL数据库DynamoDB当中，用户只能发布消息到自己的Iot设备。


## 先决条件
0. AWS账号
1. Install Browserify to make the demo to work with a browser
2. Install AWS Iot JavaScript SDK

## 操作步骤

### 第一步：资源配置

#### 0. 创建dynamoDB table
创建名称为iot的table，将IdentityId为主键，其他的保留默认值即可. 此table主要用来维护用户id和设备id之间的mapping关系。
![](https://salander.s3.cn-north-1.amazonaws.com.cn/public/cognito-with-iot-core/create-dynamodb-table.png)

#### 1. 创建cognito用户池user pool
输入user pool名称（如cognito-user-pool-for-iot），review defaults, 并根据需求做自定义修改（如可以修改necessary attributes，密码长度等），此demo均利用默认值。


#### 2. 创建并配置应用客户端app client
选择应用客户端，取消generate client secret的选项
![](https://salander.s3.cn-north-1.amazonaws.com.cn/public/cognito-with-iot-core/create-app-client.png)

在左侧APP-Integration项目下，需要我们修改的有2个地方，一是APP client setting，修改callback URL以及scope token作用范围，二是自定义domain name（需要全region唯一）
![](https://salander.s3.cn-north-1.amazonaws.com.cn/public/cognito-with-iot-core/app-client-config.png)
注意：localhost:8000请仅在测试环境中使用。

记下userPoolID和app Client ID，在下一步骤中会用到。

#### 3. 创建cognito identity pool  
命名完毕后，对于authentication provider, 选择Cognito. 输入上一步记下的两个ID：user pool ID(User Pools → demo-pool → General Settings → Pool ID)以及app client ID(User Pools → demo-pool → App Integration → App client settings → demo-app-client→ ID)， 同时我们可以勾选允许unauth用户访问。
![](https://salander.s3.cn-north-1.amazonaws.com.cn/public/cognito-with-iot-core/create-identity-pool.png)


#### 4. 设置cognito identity pool权限：授予Iot和DDB的访问权限
在点击创建后，进入到权限设置页面。可以在这里直接设置，也可以后续在IAM role当中随时更新policy。   
Identity pool会自动创建两个role，一种为unauthorized，即未登录仅游客身份的用户，可自行为此类用户授予一些基本的浏览权限；另外一种为authorized，成功验证身份的用户。   
在本文当中，我们主要实现的功能为登录用户可以并且只能访问到隶属于自己的设备，未登录用户仅能网页浏览并且有登录选项。 因此，对于授权用户我们赋予对特定id下的“iot:Connect”, “iot:Publish”, “iot:Subscribe”, “iot:Receive”, “iot:GetThingShadow”的允许权限，以及访问ddb，和修改ddb的权限。${cognito-identity.amazonaws.com:sub}为从cognito-user-pool传递过来的变量，标记用户的identityID。每个user不同且唯一。我们通过此值来限定不同user之间的访问权限。

注解说明：   
(1) 请将<Your-AWS-Account-ID>替换为自己的12位ID，去掉<>两个尖括号
(2) 请将<region-code>去掉尖括号替换为自己使用的区域，如日本为ap-northeast-1，virginia为us-east-1,如使用其他region，请务必替换为自己的对应代码，完整region-code可在https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/using-regions-availability-zones.html 找到. 本文使用的是日本区域ap-northeast-1做演示。 如resource完整示例为arn:aws:iot:us-west-1:123456789102:client/${cognito-identity.amazonaws.com:sub}
```

{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "iot:Connect"
            ],
            "Resource": [
                "arn:aws:iot:<region-code>:<Your-AWS-Account-ID>:client/${cognito-identity.amazonaws.com:sub}"
            ]
        },
        {
            "Effect": "Allow",
            "Action": [
                "iot:Publish"
            ],
            "Resource": [
                "arn:aws:iot:<region-code>:Your-AWS-Account-ID:topic/${cognito-identity.amazonaws.com:sub}/*"
            ]
        },
        {
            "Effect": "Allow",
            "Action": [
                "mobileanalytics:PutEvents",
                "cognito-sync:*",
                "cognito-identity:*",
                "iot:Subscribe",
                "iot:Receive",
                "iot:AttachPrincipalPolicy",
                "iot:AttachPolicy"
            ],
            "Resource": [
                "*"
            ]
        },
        {
            "Effect": "Allow",
            "Action": [
                "dynamodb:GetItem",
                "dynamodb:Query",
                "dynamodb:PutItem",
                "dynamodb:UpdateItem"
            ],
            "Resource": [
                "arn:aws:dynamodb:<your-region-code>:<your-account-id>:table/iot"
            ],
            "Condition": {
                "ForAllValues:StringEquals": {
                    "dynamodb:LeadingKeys": [
                        "${cognito-identity.amazonaws.com:sub}"
                    ]
                }
            }
        }
    ]
}
```


Unauth-Role
```
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "mobileanalytics:PutEvents",
        "cognito-sync:*"
      ],
      "Resource": [
        "*"
      ]
    }
  ]
}
```

#### 5. 在Iot中添加Iot policy：为Iot授予访问权限
在Iot core当中安全--策略(policy)页面，添加策略，命名cognito-identity-general-policy，具体权限如下。Cognito将通过attachPolicy命令为自己授予这条policy，使得每个Auth user有权限访问Iot且仅能发消息给自己的设备。

```
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "iot:Connect",
      "Resource": "arn:aws:iot:<your-region-code>:<account-id>:client/${cognito-identity.amazonaws.com:sub}"
    },
    {
      "Effect": "Allow",
      "Action": "iot:Publish",
      "Resource": "arn:aws:iot:<your-region-code>:<account-id>:topic/${cognito-identity.amazonaws.com:sub}/*"
    },
    {
      "Effect": "Allow",
      "Action": "iot:Subscribe",
      "Resource": "arn:aws:iot:<your-region-code>:<account-id>:topic/${cognito-identity.amazonaws.com:sub}/*"
    }
  ]
}

```

至此，通过cognito连接Iot并只能访问自己资源已经配置完毕。接下来，我们用一个前端界面演示效果。代码下载地址：https://github.com/lab798/cognito-with-iot-core

### 第二步：前端demo代码

1. (可选)新建AWSIotDeviceSdk.js文件
```
#AWSIotDeviceSdk.js
var AwsIot = require('aws-iot-device-sdk');
window.AwsIot = AwsIot; // make it global
```

2. (可选，已经附此文件bundle.js) 在shell当中运行browserify,转化为前端可引入的JS

```
terminal> browserify path/to/AWSIotDeviceSdk.js -o bundle.js
```

3. 前端代码 
在https://github.com/lab798/cognito-with-iot-core 下载代码
需要修改以下内容：
(1) 在function initCognitoSDK() 中

```
AWS.config.region ='<your-region-code>';   //替换为自己的region-code，ap-northeast-1为东京
    AWS.config.credentials = new AWS.CognitoIdentityCredentials({
        IdentityPoolId: '<identity-provider-id>', //替换为自己的identity pool id
        //example: ap-northeast-1: xxxxxxxx-xxxx-xxxx-xxxxxx
    });

    var authData = { 
      ClientId:'<your-client-id>', // APP client id here, 如5smxxxc7lcetqvao6ed967sq01
      AppWebDomain : '<your custom domain>', // 不包括 "https://" 部分. exmaple：xxx.auth.ap-northeast-1.amazoncognito.com
      TokenScopesArray : ['openid','email'], // like ['openid','email','phone']...
      RedirectUriSignIn : 'http://localhost:8000/',
      RedirectUriSignOut : 'http://localhost:8000/',
      IdentityProvider : '<identity-provider-id>',  //identity provider id,example: ap-northeast-1: xxxxxxxx-xxxx-xxxx-xxxxxx
          UserPoolId : '<your-pool-id>',   //user pool ID,example: ap-northeast-1_410bH7K8x
          AdvancedSecurityDataCollectionFlag : false//<TODO: boolean value indicating whether you want to enable advanced security data collection>
    };

    //在onsuccess回调函数当中
    AWS.config.credentials = new AWS.CognitoIdentityCredentials({
        IdentityPoolId: '<identity-provider-id>',//identity provider id,example: ap-northeast-1: xxxxxxxx-xxxx-xxxx-xxxxxx
        Logins: login
    });

```
user pool ID在User Pools → demo-pool → General Settings → Pool ID    
app client ID在User Pools → demo-pool → App Integration → App client settings → demo-app-client→ ID可找到    

(2)如果iot policy为自己命名的，则attachPolicy("cognito-identity-general-policy", principal)第一个参数替换为自己的iot policy name   
(3)在function connect(principal)当中

```
  device = AwsIot.device({
      clientId: clientID,
      host: '<your-iot-host>',   //example: xxxxxx.iot.<your-region-code>f.amazonaws.com
      protocol: 'wss',
      accessKeyId: AWS.config.credentials.accessKeyId,   
      secretKey: AWS.config.credentials.secretAccessKey,
      sessionToken: AWS.config.credentials.sessionToken  
  });

```

(4)在function userButton(auth)当中
```
  function userButton(auth) {
    var state = document.getElementById('signInButton').innerHTML;
    if (state === "Sign Out") {

      //*************************需自行修改，<your-custom-domain>替换为自己的域名************************//
      document.getElementById("signInButton").href="https://<your-custom-domain>.auth.<your-region-code>.amazoncognito.com/logout?response_type=code&client_id=<your-client-id>&logout_uri=http://localhost:8000";
      document.getElementById("signInButton").innerHTML = "Sign In";
      auth.signOut();
      showSignedOut();

    } else {
      auth.getSession();
      document.getElementById("signInButton").href="https://<your-custom-domain>.auth.<your-region-endpoint>.amazoncognito.com/login?response_type=code&client_id=<your-client-id>&redirect_uri=http://localhost:8000/";
      
    }
      
    }

```

(5)在function publishMessage(env)当中，可以选择是否设置qos参数。这两种参数会在后续的实验中有不同的效果，我们先不设置qos试试看。
```
  function publishMessage(env) {
    var topic = env.target.topic;
    var msg = env.target.msg;
    device.publish(topic,msg, function (err) {
    //device.publish(topic,msg, { qos: 1 }, function (err) {
          if (err) {
              console.log("failed to publish iot message! ",topic);
              console.error(err);
          } else {
              console.log("published to TopicName: ", topic);
              openTab("messagedetails");
              showMessage("Message Published", "Topic: "+topic , "Message: "+msg);
          }
      });

  }
```


4. 在shell当中运行
```
python -m SimpleHTTPServer
```

在浏览器当中输入http://0.0.0.0:8000 进行验证。建议打开浏览器的developer tools查看日志以及MQTT传输。
注意：在点击sign in之后，因浏览器安全等级不同，有些浏览器可能会显示connecting... unable to connect websocket的error提示，这是因为页面停留在原http页面，无法自动进行证书验证，此时需要在浏览器新tab当中手动输入https://xxx（复制原本wss://xxxx后面的url）进行手动的加载证书的操作。之后再刷新原localhost:8000即可正常加载。

5. 功能
此网页实现三个功能，一是登录，注册，是由cognito user pool来实现的；    
二是设备绑定，此网页模拟了用户拿到设备之后，手输设备号完成绑定的过程，在实际APP当中，这一步通常是由扫二维码的形式来实现绑定的，因web网页版不好模拟扫码，故用手输的方式；    
三是消息手法。点击已有设备，即模拟一次消息传输的过程。页面还有一个button是验证发送到其他topic会出现什么情况。


### 验证
 
（1）新建的cognito user pool是没有用户的，可以在页面验证用户注册和用户登录的过程，或者直接在cognito user pool当中手动创建新用户也可以。
![](https://salander.s3.cn-north-1.amazonaws.com.cn/public/cognito-with-iot-core/sign-in.png)

（2）原始dynamoDB当中没有数据，可以通过点击add a new device的按钮来模拟设备绑定的过程。这时可以输入一串字符（如iphone-15341）,点击submit按钮，等待几秒钟，在页面最下方即出现设备列表iphone-15341 publish。
![](https://salander.s3.cn-north-1.amazonaws.com.cn/public/cognito-with-iot-core/register-new-device.png)

（3）进入Iot-test页面，订阅#（通配符，即订阅所有topic）。在web页面点击刚刚出现的xxxx publish的按钮，可以在console当中看到实时的消息推送，此时Iot连接并且发布消息已成功。
![](https://salander.s3.cn-north-1.amazonaws.com.cn/public/cognito-with-iot-core/web_device_list.png)
![](https://salander.s3.cn-north-1.amazonaws.com.cn/public/cognito-with-iot-core/iot-subscribe-message.png)

（4）web页面的”Demo Unauthed situation“这个按钮，是模拟当前用户如果要发送不在权限范围内的情形，这个按钮会发送到名为test的topic。这时候我们点击此button，会出现两种不同的情况：
* 如果在publishMessage当中，不设置Qos，这时候web页面会显示发送成功，然而在Iot的console当中，会无法无法收到这条topic，实际为发送失败。
* 如果设置{qos:1}, Iot仍然无法收到这条消息，但是web页面会不断重连尝试重新发送，根据官方解释，Iot会尝试长达一个小时的重传。 "AWS IoT will retry delivery of unacknowledged quality-of-service 1 (QoS 1) publish requests to a client for up to one hour. If AWS IoT does not receive a PUBACK message from the client after one hour, it will drop the publish requests."

```
  function publishMessage(env) {
    var topic = env.target.topic;
    var msg = env.target.msg;
    //device.publish(topic,msg, function (err) {
    device.publish(topic,msg, { qos: 1 }, function (err) {
          if (err) {
              console.log("failed to publish iot message! ",topic);
              console.error(err);
          } else {
              console.log("published to TopicName: ", topic);
              openTab("messagedetails");
              showMessage("Message Published", "Topic: "+topic , "Message: "+msg);
          }
      });

  }
            
```


## 参考链接：
https://aws.amazon.com/cn/blogs/iot/configuring-cognito-user-pools-to-communicate-with-aws-iot-core/


