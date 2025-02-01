const AuthLayout = ({
	children
}: {
  children: React.ReactNode
}) => {
	return (
		<div className="min-h-screen bg-neutral-50/50 dark:bg-neutral-950/50">
			{children}
		</div>
	)
}

export default AuthLayout
