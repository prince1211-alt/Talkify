import { useState } from "react";
import { Link } from "react-router-dom";
import { Mail, Lock, LogIn, Loader2 } from "lucide-react";
import { useAuthStore } from "../store/useAuthStore";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { axiosInstance } from "../lib/axios";

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

    const handleSubmit = async (e) => {
        e.preventDefault();
        const success = await login(formData);
        if (success) {
            navigate("/");
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
            <div className="sm:mx-auto sm:w-full sm:max-w-md">
                <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
                    Sign in to your account
                </h2>
            </div>

            <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
                <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10 border border-gray-100">
                    <form className="space-y-6" onSubmit={handleSubmit}>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Unique ID / Username</label>
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
                                    placeholder="your_unique_id"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700">Password</label>
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
                                className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
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
                        <span className="text-gray-600">Don't have an account? </span>
                        <Link to="/signup" className="font-medium text-indigo-600 hover:text-indigo-500">
                            Sign up
                        </Link>
                    </div>

                    <div className="mt-4 text-center">
                        <button onClick={() => setShowForgot(true)} className="text-sm text-indigo-600 hover:underline">Forgot password?</button>
                    </div>
                </div>
            </div>

            {showForgot && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
                    <div className="bg-white p-6 rounded-lg w-full max-w-md">
                        <h3 className="text-lg font-bold mb-4">Forgot password</h3>
                        {forgotStep === 1 ? (
                            <>
                                <p className="text-sm text-gray-600">Enter your registered email to receive an OTP.</p>
                                <input value={forgotEmail} onChange={(e) => setForgotEmail(e.target.value)} placeholder="you@example.com" className="w-full mt-3 p-2 border rounded" />
                                <div className="mt-4 flex justify-end gap-2">
                                    <button onClick={() => setShowForgot(false)} className="px-3 py-1">Cancel</button>
                                    <button onClick={async () => {
                                        if (!forgotEmail) { toast.error('Please enter your email'); return; }
                                        try {
                                            await axiosInstance.post('/auth/forgot-password', { email: forgotEmail });
                                            setForgotStep(2);
                                            toast.success('OTP sent to your email');
                                        } catch (err) {
                                            toast.error(err.response?.data?.message || 'Failed to send OTP');
                                        }
                                    }} className="px-3 py-1 bg-indigo-600 text-white rounded">Send OTP</button>
                                </div>
                            </>
                        ) : (
                            <>
                                <p className="text-sm text-gray-600">Enter the OTP and your new password.</p>
                                <input value={otp} onChange={(e) => setOtp(e.target.value)} placeholder="OTP" className="w-full mt-3 p-2 border rounded" />
                                <input value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="New password" type="password" className="w-full mt-3 p-2 border rounded" />
                                <div className="mt-4 flex justify-end gap-2">
                                    <button onClick={() => { setShowForgot(false); setForgotStep(1); }} className="px-3 py-1">Cancel</button>
                                    <button onClick={async () => {
                                        if (!otp || !newPassword) { toast.error('OTP and new password are required'); return; }
                                        try {
                                            await axiosInstance.post('/auth/reset-password', { email: forgotEmail, otp, newPassword });
                                            toast.success('Password reset successful. Please login.');
                                            setShowForgot(false);
                                            setForgotStep(1);
                                            setOtp(''); setNewPassword(''); setForgotEmail('');
                                        } catch (err) {
                                            toast.error(err.response?.data?.message || 'Failed to reset password');
                                        }
                                    }} className="px-3 py-1 bg-indigo-600 text-white rounded">Reset Password</button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
