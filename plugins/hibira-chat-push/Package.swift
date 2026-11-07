// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "HibiraChatPush",
    platforms: [.iOS(.v15)],
    products: [
        .library(name: "HibiraChatPush", targets: ["HibiraChatPushPlugin"])
    ],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", from: "8.0.0"),
        .package(url: "https://github.com/hibira-io/hibira-push-ios.git", from: "1.1.0")
    ],
    targets: [
        .target(
            name: "HibiraChatPushPlugin",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "HibiraPush", package: "hibira-push-ios")
            ],
            path: "ios/Sources/HibiraChatPushPlugin")
    ]
)
