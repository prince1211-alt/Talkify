import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";

import { Mail, Lock, User, LogIn, Loader2 } from "lucide-react";
import { useAuthStore } from "../store/useAuthStore";

export default function SignUp() {
    const [formData, setFormData] = useState({
        fullName: "",
        email: "",
        password: "",
        confirmPassword: "",
    });

    const { signup, isSigningUp } = useAuthStore();
    const navigate = useNavigate();

    // ✅ Common change handler
    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData((prev) => ({ ...prev, [name]: value }));
    };

    // ✅ Submit handler
    const handleSubmit = async (e) => {

        e.preventDefault();

        if (formData.password.length < 6) {
            return toast.error("Password must be at least 6 characters");
        }
        if (formData.password !== formData.confirmPassword) {
            return toast.error("Passwords do not match");
        }

        const { confirmPassword: _confirmPassword, ...dataToSend } = formData;
        const success = await signup({ ...dataToSend, email: dataToSend.email.trim() });
        if (success) {
            navigate("/");
        }
    };

    return (
        <div className="min-h-screen bg-[linear-gradient(to_right_top,#092b5c,#005f99,#0095a5,#00c677,#a8eb12)] flex flex-col justify-center py-12 sm:px-6 lg:px-8">
            <div className="sm:mx-auto sm:w-full sm:max-w-md">
                <h2 className="mt-6 text-center text-3xl font-bold text-gray-900
                bg-gradient-to-tr from-[#8fb038] via-[#bf9a00] to-[#eb7912] 
                bg-clip-text text-transparent">
                    Create Account on Talkify
                </h2>
            </div>

            <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
                <div className="bg-[#AACEBA] py-8 px-4 shadow-lg shadow-black/70 sm:rounded-lg sm:px-10 border border-black border-opacity-50">
                    <form className="space-y-6" onSubmit={handleSubmit}>

                        {/* Full Name */}
                        <InputField
                            label="Full Name"
                            labelClassName="text-white"
                            name="fullName"
                            type="text"
                            value={formData.fullName}
                            onChange={handleChange}
                            placeholder="Enter your full name"
                            icon={<User className="h-5 w-5 text-gray-400" />}
                        />

                        {/* Email */}
                        <InputField
                            label="Email address"
                            labelClassName="text-white"
                            name="email"
                            type="email"
                            autoComplete="email"
                            value={formData.email}
                            onChange={handleChange}
                            placeholder="you@gmail.com"
                            icon={<Mail className="h-5 w-5 text-gray-400" />}
                        />

                        {/* Password */}
                        <InputField
                            label="Password"
                            labelClassName="text-white"
                            name="password"
                            type="password"
                            value={formData.password}
                            onChange={handleChange}
                            placeholder="••••••••"
                            icon={<Lock className="h-5 w-5 text-gray-400" />}
                        />

                        {/* Confirm Password */}
                        <InputField
                            label="Confirm Password"
                            labelClassName="text-white"
                            name="confirmPassword"
                            type="password"
                            value={formData.confirmPassword}
                            onChange={handleChange}
                            placeholder="••••••••"
                            icon={<Lock className="h-5 w-5 text-gray-400" />}
                        />

                        {/* Submit Button */}
                        <button
                            type="submit"
                            disabled={isSigningUp}
                            className="w-full flex justify-center py-2 px-4 rounded-md text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50"
                        >
                            {isSigningUp ? (
                                <>
                                    <Loader2 className="h-5 w-5 animate-spin mr-2" />
                                    Creating account...
                                </>
                            ) : (
                                <>
                                    <LogIn className="h-5 w-5 mr-2" />
                                    Sign up
                                </>
                            )}
                        </button>
                    </form>

                    <div className="mt-6 text-center text-sm">
                        <span className="text-gray-600">
                            Already have an account?
                        </span>{" "}
                        <Link
                            to="/login"
                            className="font-medium text-indigo-600 hover:text-indigo-500"
                        >
                            Sign in
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    );
}

/* ✅ Reusable Input Component */
function InputField({ label, labelClassName = "text-gray-700", name, type, value, onChange, placeholder, icon, inputMode, autoComplete }) {
    return (
        <div>
            <label className={`block text-sm font-medium ${labelClassName}`}>
                {label}
            </label>
            <div className="mt-1 relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    {icon}
                </div>
                <input
                    name={name}
                    type={type}
                    inputMode={inputMode}
                    autoComplete={autoComplete}
                    required
                    value={value}
                    onChange={onChange}
                    placeholder={placeholder}
                    className="block w-full pl-10 sm:text-sm border-gray-300 rounded-md py-2 border bg-gray-50 outline-none focus:ring-indigo-500 focus:border-indigo-500"
                />
            </div>
        </div>
    );
}