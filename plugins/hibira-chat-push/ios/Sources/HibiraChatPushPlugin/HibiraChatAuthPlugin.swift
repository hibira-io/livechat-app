import AuthenticationServices
import Capacitor
import Foundation

/// Sign-in with Apple, Google, Microsoft or GitHub from the inbox's sign-in
/// page. Google refuses to sign in inside a web view, so the page asks this
/// plugin to open chat.hibira.io/auth/{provider}?app=ios&… in an
/// ASWebAuthenticationSession (the system's browser sheet). The server ends
/// the sign-in on io.hibira.chat://auth#token=…; the session hands that URL
/// back here, and the page finishes the sign-in in the web view with a
/// secret it kept, so another app that claims the scheme gets nothing.
@objc(HibiraChatAuthPlugin)
public class HibiraChatAuthPlugin: CAPPlugin, CAPBridgedPlugin, ASWebAuthenticationPresentationContextProviding {
    public let identifier = "HibiraChatAuthPlugin"
    public let jsName = "HibiraChatAuth"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "open", returnType: CAPPluginReturnPromise)
    ]
    static let scheme = "io.hibira.chat"
    private var session: ASWebAuthenticationSession?

    /// { url } → { url }: the URL the sign-in came back on.
    @objc func open(_ call: CAPPluginCall) {
        guard let raw = call.getString("url"), let url = URL(string: raw),
              url.scheme == "https", url.host == HibiraChatPushPlugin.host, url.path.hasPrefix("/auth/") else {
            call.reject("bad_request")
            return
        }
        DispatchQueue.main.async {
            let s = ASWebAuthenticationSession(url: url, callbackURLScheme: Self.scheme) { [weak self] back, error in
                self?.session = nil
                if let back = back {
                    call.resolve(["url": back.absoluteString])
                } else if let error = error as? ASWebAuthenticationSessionError, error.code == .canceledLogin {
                    call.resolve(["url": Self.scheme + "://auth#error=cancelled"])
                } else {
                    call.reject(error?.localizedDescription ?? "failed")
                }
            }
            s.presentationContextProvider = self
            // Keep the browser's cookies, so a Google account stays picked.
            s.prefersEphemeralWebBrowserSession = false
            self.session = s
            if !s.start() {
                self.session = nil
                call.reject("failed")
            }
        }
    }

    public func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        bridge?.webView?.window ?? ASPresentationAnchor()
    }
}
