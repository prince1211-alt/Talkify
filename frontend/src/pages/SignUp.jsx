import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";

import { Mail, Lock, User, LogIn, Loader2 } from "lucide-react";
import { useAuthStore } from "../store/useAuthStore";
import { axiosInstance } from "../lib/axios";

export default function SignUp() {
    const [formData, setFormData] = useState({
        fullName: "",
        uniqueId: "",
        email: "",
        password: "",
        confirmPassword: "",
        otp: "",
    });

    const [sendingOtp, setSendingOtp] = useState(false);
    const { signup, isSigningUp } = useAuthStore();
    const navigate = useNavigate();

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData((prev) => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e) => {

        e.preventDefault();

        if (formData.password !== formData.confirmPassword) {
            return toast.error("Passwords do not match");
        }

        const { confirmPassword, ...dataToSend } = formData; // formData se confirmPassword hata do baki data dataToSend me daal do 
        const success = await signup(dataToSend);
        if (success) {
            navigate("/");
        }
        toast.success("Account created successfully");
    };

    const handleSendOtp = async () => {
        if (!formData.email) return toast.error("Please enter email first");

        setSendingOtp(true);
        try {
            await axiosInstance.post("/auth/sendotp", {
                email: formData.email,
            });
            toast.success("OTP sent successfully");
        } catch (error) {
            toast.error(error.response?.data?.message || "Failed to send OTP");
        } finally {
            setSendingOtp(false);
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

                        {/* Unique ID */}
                        <InputField
                            label="User ID"
                            labelClassName="text-white"
                            name="uniqueId"
                            type="text"
                            value={formData.uniqueId}
                            onChange={handleChange}
                            placeholder="UserId"
                            icon={<User className="h-5 w-5 text-gray-400" />}
                        />

                        {/* Email + OTP */}
                        <div>
                            <label className="block text-sm font-medium text-white">
                                Email address
                            </label>
                            <div className="mt-1 flex gap-2">
                                <div className="relative flex-1">
                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                        <Mail className="h-5 w-5 text-gray-400" />
                                    </div>
                                    <input
                                        name="email"
                                        type="email"
                                        required
                                        value={formData.email}
                                        onChange={handleChange}
                                        className="block w-full pl-10 sm:text-sm border-gray-300 rounded-md py-2 border bg-gray-50 outline-none focus:ring-indigo-500 focus:border-indigo-500"
                                        placeholder="Enter your email"
                                    />
                                </div>

                                <button
                                    type="button"
                                    onClick={handleSendOtp}
                                    disabled={sendingOtp}
                                    className="px-4 py-2 rounded-md text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50"
                                >
                                    {sendingOtp ? "Sending..." : "Send OTP"}
                                </button>
                            </div>
                        </div>

                        {/* OTP */}
                        <InputField
                            label="OTP Code"
                            labelClassName="text-white"
                            name="otp"
                            type="text"
                            value={formData.otp}
                            onChange={handleChange}
                            placeholder="Enter 6-digit code"
                            icon={<Lock className="h-5 w-5 text-gray-400" />}
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


function InputField({ label, name, type, value, onChange, placeholder, icon }) {
    return (
        <div>
            <label className="block text-sm font-medium text-gray-700">
                {label}
            </label>
            <div className="mt-1 relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    {icon}
                </div>
                <input
                    name={name}
                    type={type}
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