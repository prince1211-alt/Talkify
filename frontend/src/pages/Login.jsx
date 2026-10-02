import { useState } from "react";
import { Link } from "react-router-dom";
import { Mail, Lock, LogIn, Loader2 } from "lucide-react";
import { useAuthStore } from "../store/useAuthStore";
import { useNavigate } from "react-router-dom";

export default function Login() {
    const [formData, setFormData] = useState({
        email: "",
        password: "",
    });
    const navigate = useNavigate();

    const { login, isLoggingIn } = useAuthStore();
    const handleSubmit = async (e) => {
        e.preventDefault();
        const success = await login({ ...formData, email: formData.email.trim() });
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
                            <label className="block text-sm font-medium text-white">Email address</label>
                            <div className="mt-1 relative rounded-md shadow-sm">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <Mail className="h-5 w-5 text-gray-400" />
                                </div>
                                <input
                                    type="email"
                                    required
                                    autoComplete="email"
                                    value={formData.email}
                                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                    className="block w-full pl-10 sm:text-sm border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 py-2 border bg-gray-50 outline-none"
                                    placeholder="you@gmail.com"
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
                </div>
            </div>

        </div>
    );
}
