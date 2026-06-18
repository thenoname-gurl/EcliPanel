  useEffect(() => {
    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current)
        if (Object.keys(pendingSettingsRef.current).length > 0) {
          saveUserSettings({ ...pendingSettingsRef.current })
        }
      }
    }
  }, [])