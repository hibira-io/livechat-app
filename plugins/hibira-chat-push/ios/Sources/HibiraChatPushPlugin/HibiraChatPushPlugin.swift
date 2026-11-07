import Capacitor
import Foundation
import HibiraPush
import UserNotifications

/// The agent app's native side.
///
/// Notifications: a web view has no Web Push, so after sign-in the inbox
/// page hands this plugin the response of POST /api/v1/push/token
/// ({ instance_id, endpoint, user_id, token }). The phone then registers
/// with APNs through Hibira Push as that agent. Tapping a notice opens its
/// conversation.
///
/// Links: sign-in emails (/login/verify#token=…), single sign-on
/// (/sso/jwt?…) and /inbox links open the app as Universal Links
/// (chat.hibira.io/.well-known/apple-app-site-association); this loads
/// them in the web view, which keeps the session cookie.
@objc(HibiraChatPushPlugin)
public class HibiraChatPushPlugin: CAPPlugin, CAPBridgedPlugin, NotificationHandlerProtocol {
    public let identifier = "HibiraChatPushPlugin"
    public let jsName = "HibiraChatPush"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "register", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "signOut", returnType: CAPPluginReturnPromise)
    ]
    static let host = "chat.hibira.io"
    private let tokens = HandedToken()
    private let userKey = "io.hibira.chat.push-user"

    override public func load() {
        bridge?.notificationRouter.pushNotificationHandler = self
        NotificationCenter.default.addObserver(self, selector: #selector(didRegister(_:)),
                                               name: .capacitorDidRegisterForRemoteNotifications, object: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(openLink(_:)),
                                               name: .capacitorOpenUniversalLink, object: nil)
        // A link that launched the app arrived before this plugin loaded.
        if let url = ApplicationDelegateProxy.shared.lastURL {
            open(url)
        }
    }

    /// { instance_id, endpoint, user_id, token }
    @objc func register(_ call: CAPPluginCall) {
        guard let instanceId = call.getString("instance_id"), UUID(uuidString: instanceId) != nil,
              let userId = call.getString("user_id"), !userId.isEmpty,
              let token = call.getString("token"), !token.isEmpty else {
            call.reject("bad_request")
            return
        }
        tokens.value = token
        let previous = UserDefaults.standard.string(forKey: userKey)
        DispatchQueue.main.async {
            let go = {
                if let endpoint = call.getString("endpoint"), endpoint.hasPrefix("https://") {
                    PushNotifications.shared.setEndpoint(endpoint)
                }
                PushNotifications.shared.start(instanceId: instanceId)
                PushNotifications.shared.registerForRemoteNotifications()
                PushNotifications.shared.setUserId(userId, tokenProvider: self.tokens) { error in
                    if let error = error {
                        call.reject(error.localizedDescription)
                    } else {
                        UserDefaults.standard.set(userId, forKey: self.userKey)
                        call.resolve()
                    }
                }
            }
            // Another agent (or workspace) on this phone: start over.
            if let previous = previous, previous != userId {
                PushNotifications.shared.clearAllState { DispatchQueue.main.async(execute: go) }
            } else {
                go()
            }
        }
    }

    @objc func signOut(_ call: CAPPluginCall) {
        UserDefaults.standard.removeObject(forKey: userKey)
        PushNotifications.shared.clearAllState { call.resolve() }
    }

    @objc private func didRegister(_ note: Notification) {
        if let token = note.object as? Data {
            PushNotifications.shared.registerDeviceToken(token)
        }
    }

    @objc private func openLink(_ note: Notification) {
        guard let info = note.object as? [String: Any], let url = info["url"] as? URL else { return }
        open(url)
    }

    private func open(_ url: URL) {
        guard url.scheme == "https", url.host == Self.host else { return }
        DispatchQueue.main.async { _ = self.bridge?.webView?.load(URLRequest(url: url)) }
    }

    // A notice that arrives while the app is open still shows as a banner.
    public func willPresent(notification: UNNotification) -> UNNotificationPresentationOptions {
        return [.banner, .sound, .list]
    }

    public func didReceive(response: UNNotificationResponse) {
        let info = response.notification.request.content.userInfo
        _ = PushNotifications.shared.handleNotification(userInfo: info)
        guard let data = info["data"] as? [String: Any], let raw = data["url"] as? String, let url = URL(string: raw) else { return }
        open(url)
    }
}

/// The page fetched the token with its own cookie; Hibira Push asks for it here.
final class HandedToken: NSObject, TokenProvider {
    var value = ""

    func fetchToken(userId: String, completionHandler completion: @escaping (String, Error?) -> Void) throws {
        completion(value, nil)
    }
}
