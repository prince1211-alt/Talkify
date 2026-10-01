import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Mail, Lock, LogIn, Loader2 } from "lucide-react";
import { useAuthStore } from "../store/useAuthStore";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { axiosInstance } from "../lib/axios";
import { generateRSAKeyPair, encryptPrivateKeyWithPassword } from "../utils/crypto";

export default function Login() {
    const [formData, setFormData] = useState({
        uniqueId: "",
        password: "",
    });
    const navigate = useNavigate();

    const { login, isLoggingIn } = useAuthStore();

    const [showForgot, setShowForgot] = useState(false);
    const [forgotEmail, setForgotEmail] = useState("");
    const [forgotStep, setForgotStep] = useState(1); // 1: send email, 2: verify & reset
    const [otp, setOtp] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [isForgotBusy, setIsForgotBusy] = useState(false);
    const [otpCooldown, setOtpCooldown] = useState(0);

    useEffect(() => {
        if (otpCooldown <= 0) return undefined;
        const id = setTimeout(() => setOtpCooldown((s) => s - 1), 1000);
        return () => clearTimeout(id);
    }, [otpCooldown]);

    const closeForgot = () => {
        setShowForgot(false);
        setForgotStep(1);
        setOtp("");
        setNewPassword("");
    };

    const sendResetOtp = async () => {
        const email = forgotEmail.trim();
        if (!email) { toast.error('Please enter your email'); return; }
        setIsForgotBusy(true);
        try {
            await axiosInstance.post('/auth/forgot-password', { email });
            setForgotStep(2);
            setOtpCooldown(60);
            toast.success('OTP sent! Check your inbox (and spam folder).');
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to send OTP');
        } finally {
            setIsForgotBusy(false);
        }
    };

    // The old private key was locked with the old password, so a reset needs a new key pair
    const resetPassword = async () => {
        if (!otp.trim() || !newPassword) { toast.error('OTP and new password are required'); return; }
        if (newPassword.length < 6) { toast.error('Password must be at least 6 characters'); return; }
        setIsForgotBusy(true);
        try {
            const { publicKeyStr, privateKeyStr } = await generateRSAKeyPair();
            const encryptedPrivateKey = await encryptPrivateKeyWithPassword(privateKeyStr, newPassword);
            await axiosInstance.post('/auth/reset-password', {
                email: forgotEmail.trim(),
                otp: otp.trim(),
                newPassword,
                publicKey: publicKeyStr,
                encryptedPrivateKey,
            });
            toast.success('Password reset successful. Please login.');
            closeForgot();
            setForgotEmail('');
        } catch (err) {
            toast.error(err.response?.data?.message || err.message || 'Failed to reset password');
        } finally {
            setIsForgotBusy(false);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        const success = await login(formData);
        if (success) {
            navigate("/");
        }
    };

    return (
        <div className="min-h-screen bg-[linear-gradient(to_right_top,#092b5c,#005f99,#0095a5,#00c677,#a8eb12)] flex flex-col justify-center py-12 sm:px-6 lg:px-8">
            <div className="sm:mx-auto sm:w-full sm:max-w-md">
                <h2 className="mt-6 text-center text-3xl font-bold  
                bg-gradient-to-tr from-[#8fb038] via-[#bf9a00] to-[#eb7912] 
                bg-clip-text text-transparent">
                    Welcome to Talkify
                </h2>
            </div>

            <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
                <div className="bg-[#AACEBA] py-8 px-4 shadow-lg shadow-black/50 sm:rounded-lg sm:px-10 border border-black">
                    <form className="space-y-6" onSubmit={handleSubmit}>
                        <div>
                            <label className="block text-sm font-medium text-white">User ID or Email</label>
                            <div className="mt-1 relative rounded-md shadow-sm">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <Mail className="h-5 w-5 text-gray-400" />
                                </div>
                                <input
                                    type="text"
                                    required
                                    value={formData.uniqueId}
                                    onChange={(e) => setFormData({ ...formData, uniqueId: e.target.value })}
                                    className="block w-full pl-10 sm:text-sm border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 py-2 border bg-gray-50 outline-none"
                                    placeholder="User ID or email"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-white">Password</label>
                            <div className="mt-1 relative rounded-md shadow-sm">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <Lock className="h-5 w-5 text-gray-400" />
                                </div>
                                <input
                                    type="password"
                                    required
                                    value={formData.password}
                                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                    className="block w-full pl-10 sm:text-sm border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 py-2 border bg-gray-50 outline-none"
                                    placeholder="••••••••"
                                />
                            </div>
                        </div>

                        <div>
                            <button
                                type="submit"
                                disabled={isLoggingIn}
                                className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-[#140655] hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
                            >
                                {isLoggingIn ? (
                                    <>
                                        <Loader2 className="h-5 w-5 animate-spin mr-2" />
                                        Signing in...
                                    </>
                                ) : (
                                    <>
                                        <LogIn className="h-5 w-5 mr-2" />
                                        Sign in
                                    </>
                                )}
                            </button>
                        </div>
                    </form>

                    <div className="mt-6 text-center text-sm">
                        <span className="text-white">Don't have an account? </span>
                        <Link to="/signup" className="font-medium text-blue-500 hover:text-green-600 text-md">
                            Sign up
                        </Link>
                    </div>

                    <div className="mt-4 text-center">
                        <button type="button" onClick={() => setShowForgot(true)} className="text-sm text-blue-500 hover:text-green-600 text-md hover:underline">Forgot password?</button>
                    </div>
                </div>
            </div>

            {showForgot && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
                    <div className="bg-gray-100 p-6 rounded-lg w-full max-w-md">
                        <h3 className="text-lg font-bold mb-4">Forgot password</h3>
                        {forgotStep === 1 ? (
                            <>
                                <p className="text-sm text-gray-600">Enter your registered email to receive an OTP.</p>
                                <input type="email" value={forgotEmail} onChange={(e) => setForgotEmail(e.target.value)} placeholder="Enter your registered email" className="w-full mt-3 p-2 border rounded" />
                                <div className="mt-4 flex justify-end gap-2">
                                    <button type="button" onClick={closeForgot} className="px-3 py-1">Cancel</button>
                                    <button type="button" disabled={isForgotBusy} onClick={sendResetOtp} className="px-3 py-1 bg-green-600 text-gray-100 rounded disabled:opacity-50">
                                        {isForgotBusy ? 'Sending...' : 'Send OTP'}
                                    </button>
                                </div>
                            </>
                        ) : (
                            <>
                                <p className="text-sm text-gray-600">Enter the OTP sent to {forgotEmail.trim()} and your new password.</p>
                                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2 mt-2">
                                    For your security, resetting the password creates new encryption keys.
                                    Messages you received before the reset can't be decrypted afterwards.
                                </p>
                                <input value={otp} onChange={(e) => setOtp(e.target.value)} placeholder="OTP" inputMode="numeric" autoComplete="one-time-code" className="w-full mt-3 p-2 border rounded" />
                                <input value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="New password (min 6 characters)" type="password" autoComplete="new-password" className="w-full mt-3 p-2 border rounded" />
                                <div className="mt-4 flex justify-between items-center gap-2">
                                    <button type="button" disabled={isForgotBusy || otpCooldown > 0} onClick={sendResetOtp} className="text-sm text-blue-600 disabled:text-gray-400">
                                        {otpCooldown > 0 ? `Resend OTP in ${otpCooldown}s` : 'Resend OTP'}
                                    </button>
                                    <div className="flex gap-2">
                                        <button type="button" onClick={closeForgot} className="px-3 py-1">Cancel</button>
                                        <button type="button" disabled={isForgotBusy} onClick={resetPassword} className="px-3 py-1 bg-indigo-600 text-white rounded disabled:opacity-50">
                                            {isForgotBusy ? 'Resetting...' : 'Reset Password'}
                                        </button>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
