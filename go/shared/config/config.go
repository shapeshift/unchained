// Supports reading config files and unmarshaling the values in a user defined struct

package config

import (
	"bytes"
	"encoding/json"
	"os"

	"github.com/pkg/errors"
	"github.com/spf13/viper"
)

// Load reads in a file at the specified path and unmarshals the values into your config struct
func Load(path string, config interface{}) error {
	viper.SetConfigFile(path)
	if err := viper.ReadInConfig(); err != nil {
		return errors.Wrapf(err, "failed to read config from file path: %s", path)
	}

	if err := viper.Unmarshal(config); err != nil {
		return errors.Wrap(err, "failed to unmarshal config")
	}

	return nil
}

func LoadFromEnv(config interface{}, keys ...string) error {
	envVars := make(map[string]interface{})
	for _, key := range keys {
		val, ok := os.LookupEnv(key)
		if !ok {
			return errors.Errorf("%s environment variable not set", key)
		}

		envVars[key] = val
	}

	jsonStr, err := json.Marshal(envVars)
	if err != nil {
		return errors.Wrapf(err, "failed to marshal envVars: %v", envVars)
	}

	viper.SetConfigType("json")

	if err := viper.ReadConfig(bytes.NewBuffer(jsonStr)); err != nil {
		return errors.Wrapf(err, "failed to read json: %s", jsonStr)
	}

	if err := viper.Unmarshal(config); err != nil {
		return errors.Wrap(err, "failed to unmarshal config")
	}

	return nil
}
